import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { existsSync, mkdtempSync, readdirSync } from "fs";
import { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import { io, Socket } from "socket.io-client";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import { GeocodingService } from "../src/mapbox/geocoding.service";
import { LngLat, RoutePlan, RouteRequest, RoutingService } from "../src/routing/routing.types";
import { distanceM as distanceM_ } from "../src/telematics/geo";
import { TrafficService } from "../src/trips/traffic.service";
import { SimulatedTelematicsProvider } from "../src/telematics/simulated-telematics.provider";
import { PositionFix } from "../src/telematics/telematics.types";
import { setupApp } from "../src/setup-app";
import { TEST_DATABASE_URL } from "./test-env";

const UPLOAD_DIR = mkdtempSync(join(tmpdir(), "logistic-uploads-"));

// Fake providers so tests never call Mapbox.
const PLACES: Record<string, LngLat> = {
  Dallas: [-96.8, 32.78],
  Chicago: [-87.63, 41.88],
  Memphis: [-90.05, 35.15],
  // Inside a 3.5 t zone: heavier trucks get a weight violation on the way in.
  "Old Town": [-90.065, 29.958],
  // Short hops near [40, 0] for simulator and next-pickup tests. One simulator tick at 30x covers
  // at least ~1.3 km (speed varies 79-85 km/h), so [40, 0] -> P1 -> D1 (~1.1 km) always finishes in one tick.
  P1: [40, 0.005],
  D1: [40, 0.01],
  P2: [40, 0.02],
  D2: [40, 0.027],
  Far: [45, 5],
  "Walmart DC Temple": [-97.34, 31.1],
};
const geocoder = { geocode: jest.fn(async (q: string) => PLACES[q] ?? null) };
// Straight lines at 60 km/h, so durations scale with distance.
const fakeRoute = async ({ coordinates, vehicle }: RouteRequest): Promise<RoutePlan[]> => {
  const intoOldTown = coordinates.some(([x, y]) => x === PLACES["Old Town"][0] && y === PLACES["Old Town"][1]);
  const notices: RoutePlan["notices"] =
    intoOldTown && (vehicle?.weightT ?? 0) > 3.5
      ? [{ type: "violation", subtype: "maxWeight", message: "Vehicle is too heavy for this road" }]
      : [];
  const legs = coordinates.slice(1).map((to, i) => {
    const distanceM = distanceM_(coordinates[i], to);
    return { distanceM, durationS: distanceM / 16.67 };
  });
  const distanceM = legs.reduce((sum, leg) => sum + leg.distanceM, 0);
  return [
    {
      distanceM,
      durationS: distanceM / 16.67,
      summary: "",
      geometry: { type: "LineString", coordinates },
      legs,
      steps: [],
      notices,
      incidents: [],
    },
  ];
};
const router = {
  route: jest.fn(fakeRoute),
  travelTimes: jest.fn(async (origin: LngLat, destinations: LngLat[]) =>
    destinations.map((d) => ({ durationS: distanceM_(origin, d) / 16.67, distanceM: distanceM_(origin, d) })),
  ),
  maxMatrixDestinations: 9,
};

describe("API (e2e)", () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let dispatcherToken: string;
  let driverToken: string;

  const api = () => request(app.getHttpServer());
  const liveUrl = () => {
    const server = app.getHttpServer() as unknown as { address(): AddressInfo };
    return `http://localhost:${server.address().port}/live`;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.JWT_ACCESS_SECRET = "test-secret";
    process.env.TELEMATICS_PROVIDER = "none";
    process.env.TRAFFIC_MONITOR_INTERVAL_MS = "0";
    process.env.LOADBOARD_SYNC_INTERVAL_MS = "0";
    process.env.LOGIN_RATE_LIMIT = "1000";
    process.env.COMPLIANCE_CHECK_INTERVAL_MS = "0";
    process.env.UPLOAD_DIR = UPLOAD_DIR;
    // Voice commands use the keyword parser in tests.
    process.env.ANTHROPIC_API_KEY = "";
    process.env.TELEMATICS_WEBHOOK_SECRET = "test-webhook-secret";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GeocodingService)
      .useValue(geocoder)
      .overrideProvider(RoutingService)
      .useValue(router)
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    // Listen on a real port so Socket.IO clients can connect.
    await app.listen(0);

    const auth = app.get(AuthService);
    await auth.register("admin@test.local", "password123", "admin");
    await auth.register("dispatcher@test.local", "password123", "dispatcher");
    await auth.register("driver@test.local", "password123", "driver");
    adminToken = (await auth.login("admin@test.local", "password123")).accessToken;
    dispatcherToken = (await auth.login("dispatcher@test.local", "password123")).accessToken;
    driverToken = (await auth.login("driver@test.local", "password123")).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("auth", () => {
    it("rejects requests without a token", async () => {
      await api().get("/api/trucks").expect(401);
    });

    it("logs in, rotates the refresh token and rejects a replayed one", async () => {
      const login = await api()
        .post("/api/auth/login")
        .send({ email: "dispatcher@test.local", password: "password123" })
        .expect(200);
      expect(login.body.user).toMatchObject({ email: "dispatcher@test.local", role: "dispatcher" });

      const refreshed = await api()
        .post("/api/auth/refresh")
        .send({ refreshToken: login.body.refreshToken })
        .expect(200);
      expect(refreshed.body.refreshToken).not.toEqual(login.body.refreshToken);

      await api().post("/api/auth/refresh").send({ refreshToken: login.body.refreshToken }).expect(401);
      // Replay revokes every session for the user, including the newest one.
      await api().post("/api/auth/refresh").send({ refreshToken: refreshed.body.refreshToken }).expect(401);
    });

    it("rejects a wrong password", async () => {
      await api().post("/api/auth/login").send({ email: "admin@test.local", password: "nope" }).expect(401);
    });

    it("returns the current user", async () => {
      const me = await api().get("/api/auth/me").auth(adminToken, { type: "bearer" }).expect(200);
      expect(me.body).toMatchObject({ email: "admin@test.local", role: "admin" });
    });

    it("only lets admins register accounts", async () => {
      await api()
        .post("/api/auth/register")
        .auth(dispatcherToken, { type: "bearer" })
        .send({ email: "x@test.local", password: "password123" })
        .expect(403);
      await api()
        .post("/api/auth/register")
        .auth(adminToken, { type: "bearer" })
        .send({ email: "x@test.local", password: "password123" })
        .expect(201);
    });
  });

  describe("fleet and cargo", () => {
    const asDispatcher = <T extends request.Test>(req: T) => req.auth(dispatcherToken, { type: "bearer" });

    it("creates trucks with dimensions and rejects duplicates", async () => {
      const res = await asDispatcher(api().post("/api/trucks"))
        .send({ truckNumber: "T-1", truckModel: "Volvo FH", heightM: 4, weightT: 40 })
        .expect(201);
      expect(res.body).toMatchObject({ truckNumber: "T-1", status: "available", heightM: 4 });

      await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "T-1" }).expect(409);
      await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "T-2", heightM: 12 }).expect(400);
    });

    it("lets drivers read but not modify the fleet", async () => {
      await api().get("/api/trucks").auth(driverToken, { type: "bearer" }).expect(200);
      await api().post("/api/trucks").auth(driverToken, { type: "bearer" }).send({ truckNumber: "T-9" }).expect(403);
    });

    it("returns 404 for unknown ids and 400 for malformed ones", async () => {
      await asDispatcher(api().get("/api/trucks/00000000-0000-0000-0000-000000000000")).expect(404);
      await asDispatcher(api().get("/api/trucks/undefined")).expect(400);
    });

    it("reports whether a driver email is registered", async () => {
      await asDispatcher(api().post("/api/drivers"))
        .send({ firstName: "A", lastName: "B", truckDriverEmail: "ab@test.local", phoneNumber: 359888 })
        .expect(201);
      const taken = await asDispatcher(api().get("/api/drivers/email-exists?email=ab@test.local")).expect(200);
      const free = await asDispatcher(api().get("/api/drivers/email-exists?email=zz@test.local")).expect(200);
      expect([taken.body.exists, free.body.exists]).toEqual([true, false]);
    });

    it("marks assigned resources taken and frees them on reassignment and delete", async () => {
      const truck = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "T-A" })).body;
      const other = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "T-B" })).body;
      const status = async (id: string) => (await asDispatcher(api().get(`/api/trucks/${id}`))).body.status;

      const cargo = (
        await asDispatcher(api().post("/api/cargos"))
          .send({ shipperName: "S", weight: 1200, truckId: truck.id, driverId: "" })
          .expect(201)
      ).body;
      expect(cargo).toMatchObject({ status: "new", weight: "1200", truckId: truck.id, driverId: null });
      expect(await status(truck.id)).toBe("taken");

      const edited = await asDispatcher(api().patch(`/api/cargos/${cargo.id}`)).send({ truckId: other.id }).expect(200);
      expect(edited.body.status).toBe("edited");
      expect([await status(truck.id), await status(other.id)]).toEqual(["available", "taken"]);

      await asDispatcher(api().post(`/api/cargos/${cargo.id}/confirm`)).expect(200);
      const confirmed = await asDispatcher(api().get("/api/cargos?status=confirmed")).expect(200);
      expect(confirmed.body.map((c: { id: string }) => c.id)).toContain(cargo.id);

      await asDispatcher(api().delete(`/api/cargos/${cargo.id}`)).expect(204);
      expect(await status(other.id)).toBe("available");
    });

    it("filters by status", async () => {
      const available = await asDispatcher(api().get("/api/trucks?status=available")).expect(200);
      expect(available.body.every((t: { status: string }) => t.status === "available")).toBe(true);
    });
  });

  describe("routing", () => {
    const asDispatcher = <T extends request.Test>(req: T) => req.auth(dispatcherToken, { type: "bearer" });

    beforeEach(() => jest.clearAllMocks());

    it("geocodes cargo locations on create and only re-geocodes changed text", async () => {
      const cargo = (
        await asDispatcher(api().post("/api/cargos")).send({ pickupLocation: "Dallas", deliveryLocation: "Chicago" }).expect(201)
      ).body;
      expect(cargo.pickupPoint).toEqual({ x: -96.8, y: 32.78 });
      expect(cargo.deliveryPoint).toEqual({ x: -87.63, y: 41.88 });

      geocoder.geocode.mockClear();
      const edited = await asDispatcher(api().patch(`/api/cargos/${cargo.id}`))
        .send({ pickupLocation: "Dallas", deliveryLocation: "Memphis" })
        .expect(200);
      expect(geocoder.geocode.mock.calls).toEqual([["Memphis"]]);
      expect(edited.body.deliveryPoint).toEqual({ x: -90.05, y: 35.15 });
    });

    it("routes a cargo with the assigned truck's dimensions", async () => {
      const truck = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "R-1", heightM: "4.2", weightT: "40" })).body;
      const cargo = (
        await asDispatcher(api().post("/api/cargos")).send({ pickupLocation: "Dallas", deliveryLocation: "Chicago" })
      ).body;
      await asDispatcher(api().post(`/api/cargos/${cargo.id}/confirm`)).expect(200);

      const assigned = await asDispatcher(api().post(`/api/cargos/${cargo.id}/assign`)).send({ truckId: truck.id }).expect(200);
      expect(assigned.body).toMatchObject({ truckId: truck.id, status: "confirmed" });

      const res = await asDispatcher(api().get(`/api/cargos/${cargo.id}/route?from=-90.05,35.15`)).expect(200);
      expect(res.body).toMatchObject({ pickup: PLACES.Dallas, delivery: PLACES.Chicago, truck: { id: truck.id } });
      expect(router.route).toHaveBeenCalledWith({
        coordinates: [PLACES.Memphis, PLACES.Dallas, PLACES.Chicago],
        vehicle: expect.objectContaining({ heightM: 4.2, weightT: 40 }),
      });
    });

    it("asks the dispatcher to accept truck restrictions before assigning", async () => {
      const heavy = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "H-1", weightT: "40" })).body;
      const other = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "H-2", weightT: "26" })).body;
      const van = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "V-1", weightT: "3.5" })).body;
      const cargo = (
        await asDispatcher(api().post("/api/cargos")).send({ pickupLocation: "Dallas", deliveryLocation: "Old Town" })
      ).body;
      const assign = (body: object) => asDispatcher(api().post(`/api/cargos/${cargo.id}/assign`)).send(body);

      const refused = await assign({ truckId: heavy.id }).expect(409);
      expect(refused.body).toMatchObject({ code: "ROUTE_RESTRICTIONS", violations: ["Vehicle is too heavy for this road"] });
      expect((await asDispatcher(api().get(`/api/cargos/${cargo.id}`))).body.truckId).toBeNull();

      const accepted = await assign({ truckId: heavy.id, acceptRestrictions: true }).expect(200);
      expect(accepted.body).toMatchObject({
        truckId: heavy.id,
        restrictionsAcceptedBy: "dispatcher@test.local",
        restrictionsAcceptedTruckId: heavy.id,
      });
      // Changing only the driver keeps the acceptance for the same truck.
      await assign({ driverId: "" }).expect(200);

      await assign({ truckId: other.id }).expect(409);
      const light = await assign({ truckId: van.id }).expect(200);
      expect(light.body).toMatchObject({ truckId: van.id, restrictionsAcceptedAt: null, restrictionsAcceptedTruckId: null });
    });

    it("explains when a cargo location cannot be found", async () => {
      const cargo = (
        await asDispatcher(api().post("/api/cargos")).send({ pickupLocation: "Atlantis", deliveryLocation: "Chicago" })
      ).body;
      const res = await asDispatcher(api().get(`/api/cargos/${cargo.id}/route`)).expect(422);
      expect(res.body.message).toContain("Atlantis");
    });

    it("validates ad-hoc route requests", async () => {
      await asDispatcher(api().post("/api/routing/route")).send({ coordinates: [[0, 0]] }).expect(400);
      await asDispatcher(api().post("/api/routing/route")).send({ coordinates: [[0, 0], [200, 0]] }).expect(400);
      await asDispatcher(api().post("/api/routing/route")).send({ coordinates: [[0, 0], [1, 1]] }).expect(200);
    });

    it("stores empty truck dimensions as null", async () => {
      const truck = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "R-2", heightM: "" }).expect(201)).body;
      expect(truck.heightM).toBeNull();
    });
  });

  describe("telematics", () => {
    const asDispatcher = <T extends request.Test>(req: T) => req.auth(dispatcherToken, { type: "bearer" });
    const webhook = (body: object, secret = "test-webhook-secret") =>
      api().post("/api/telematics/webhook").set("x-telematics-secret", secret).send(body);
    let truckA: { id: string };
    let truckB: { id: string };

    beforeAll(async () => {
      truckA = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "GPS-A" })).body;
      truckB = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "GPS-B", telematicsId: "samsara-42" })).body;
    });

    it("rejects webhooks without the shared secret", async () => {
      const body = { positions: [{ vehicleId: "GPS-A", lng: 1, lat: 1 }] };
      await api().post("/api/telematics/webhook").send(body).expect(401);
      await webhook(body, "wrong").expect(401);
      await webhook({ positions: [{ vehicleId: "GPS-A", lng: 1, lat: 100 }] }).expect(400);
    });

    it("stores fixes matched by truck number or telematics id and reports unknown vehicles", async () => {
      const res = await webhook({
        positions: [
          { vehicleId: "GPS-A", lng: -95, lat: 35, speedKmh: 80, heading: 90, recordedAt: "2026-01-01T10:00:00Z" },
          { vehicleId: "GPS-A", lng: -95.1, lat: 35, speedKmh: 82, recordedAt: "2026-01-01T10:01:00Z" },
          { vehicleId: "samsara-42", lng: -100, lat: 40 },
          { vehicleId: "nobody", lng: 0, lat: 0 },
        ],
      }).expect(202);
      expect(res.body).toEqual({ accepted: 3, unknownVehicles: ["nobody"] });

      const latest = await asDispatcher(api().get("/api/positions/latest")).expect(200);
      const byTruck = new Map(latest.body.map((p: { truckId: string }) => [p.truckId, p]));
      expect(byTruck.get(truckA.id)).toMatchObject({ point: [-95.1, 35], speedKmh: 82, recordedAt: "2026-01-01T10:01:00.000Z" });
      expect(byTruck.get(truckB.id)).toMatchObject({ point: [-100, 40] });
    });

    it("returns a truck's track in chronological order", async () => {
      const res = await asDispatcher(
        api().get(`/api/trucks/${truckA.id}/positions?since=2025-12-31T00:00:00Z&limit=10`),
      ).expect(200);
      expect(res.body.map((p: { point: LngLat }) => p.point)).toEqual([
        [-95, 35],
        [-95.1, 35],
      ]);
      const newest = await asDispatcher(api().get(`/api/trucks/${truckA.id}/positions?since=2025-12-31T00:00:00Z&limit=1`));
      expect(newest.body.map((p: { point: LngLat }) => p.point)).toEqual([[-95.1, 35]]);
    });

    it("refuses live connections without a valid token", async () => {
      const socket = io(liveUrl(), { auth: { token: "nope" }, transports: ["websocket"] });
      const error = await new Promise<Error>((resolve) => socket.on("connect_error", resolve));
      socket.close();
      expect(error.message).toBe("unauthorized");
    });

    it("streams new positions to dispatchers", async () => {
      const socket: Socket = io(liveUrl(), { auth: { token: dispatcherToken }, transports: ["websocket"] });
      try {
        await new Promise<void>((resolve, reject) => {
          socket.on("connect", resolve);
          socket.on("connect_error", reject);
        });
        const received = new Promise((resolve) => socket.on("position", resolve));
        await webhook({ positions: [{ vehicleId: "GPS-B", lng: 21, lat: 41, speedKmh: 70 }] }).expect(202);
        expect(await received).toMatchObject({ truckId: truckB.id, point: [21, 41], speedKmh: 70 });
      } finally {
        socket.close();
      }
    });

    it("simulates assigned trucks from their last position", async () => {
      await asDispatcher(api().post("/api/cargos")).send({ pickupLocation: "Dallas", deliveryLocation: "Chicago", truckId: truckA.id });
      const simulator = app.get(SimulatedTelematicsProvider);
      const fixes: PositionFix[] = [];
      await simulator.plan();
      expect(router.route).toHaveBeenLastCalledWith(
        expect.objectContaining({ coordinates: [[-95.1, 35], PLACES.Dallas, PLACES.Chicago] }),
      );
      await simulator.tick(async (batch) => fixes.push(...batch));
      const own = fixes.filter((f) => f.truckId === truckA.id);
      expect(own).toHaveLength(1);
      expect(own[0].speedKmh).toBeGreaterThan(0);
    });
  });

  describe("trips", () => {
    const asDispatcher = <T extends request.Test>(req: T) => req.auth(dispatcherToken, { type: "bearer" });
    const webhook = (positions: object[]) =>
      api().post("/api/telematics/webhook").set("x-telematics-secret", "test-webhook-secret").send({ positions });
    const status = async (kind: "trucks" | "drivers", id: string) =>
      (await asDispatcher(api().get(`/api/${kind}/${id}`))).body.status;
    const newCargo = async (pickupLocation: string, deliveryLocation: string, extra: object = {}) =>
      (await asDispatcher(api().post("/api/cargos")).send({ pickupLocation, deliveryLocation, ...extra }).expect(201)).body;

    let truck: { id: string };
    let driver: { id: string };
    let driverToken: string;

    beforeAll(async () => {
      truck = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "TRIP-1" })).body;
      driver = (
        await asDispatcher(api().post("/api/drivers")).send({
          firstName: "Dana",
          lastName: "Driver",
          truckDriverEmail: "dana@test.local",
        })
      ).body;
      await webhook([{ vehicleId: "TRIP-1", lng: 40, lat: 0 }]).expect(202);

      await asDispatcher(api().post(`/api/drivers/${driver.id}/account`)).send({ password: "driverpass1" }).expect(201);
      await asDispatcher(api().post(`/api/drivers/${driver.id}/account`)).send({ password: "driverpass1" }).expect(409);
      driverToken = (
        await api().post("/api/auth/login").send({ email: "dana@test.local", password: "driverpass1" }).expect(200)
      ).body.accessToken;
    });

    const asDriver = <T extends request.Test>(req: T) => req.auth(driverToken, { type: "bearer" });

    it("ranks unassigned loads by drive time to their pickup", async () => {
      const near = await newCargo("P2", "D2", { pickupDate: "2999-01-01" });
      const far = await newCargo("Far", "D1");
      const res = await asDispatcher(api().get(`/api/trucks/${truck.id}/next-pickups`)).expect(200);

      expect(res.body.origin).toMatchObject({ point: [40, 0], after: "current-position" });
      const ids = res.body.candidates.map((c: { cargo: { id: string } }) => c.cargo.id);
      expect(ids[0]).toBe(near.id);
      expect(ids.indexOf(far.id)).toBeGreaterThan(0);
      expect(res.body.candidates[0]).toMatchObject({ onTime: true });
      const durations = res.body.candidates.map((c: { durationS: number }) => c.durationS);
      expect(durations).toEqual([...durations].sort((a, b) => a - b));

      await asDispatcher(api().delete(`/api/cargos/${near.id}`)).expect(204);
      await asDispatcher(api().delete(`/api/cargos/${far.id}`)).expect(204);
    });

    it("gives the driver their trip and lets them work it", async () => {
      expect((await asDriver(api().get("/api/me/trip")).expect(200)).body.trip).toBeNull();
      await asDispatcher(api().get("/api/me/trip")).expect(403);

      const cargo = await newCargo("P1", "D1", { truckId: truck.id, driverId: driver.id });
      const mine = await asDriver(api().get("/api/me/trip")).expect(200);
      expect(mine.body.trip).toMatchObject({
        cargo: { id: cargo.id },
        nextStop: { kind: "pickup", point: PLACES.P1 },
        route: { geometry: { coordinates: [[40, 0], PLACES.P1, PLACES.D1] } },
      });

      await asDriver(api().post(`/api/me/trip/${cargo.id}/delivered`)).expect(409);
      await asDriver(api().post(`/api/me/trip/${cargo.id}/picked-up`)).expect(200);
      expect((await asDriver(api().get("/api/me/trip"))).body.trip.nextStop).toMatchObject({ kind: "delivery" });

      await asDriver(api().post(`/api/me/trip/${cargo.id}/delay`)).send({ minutes: 45, reason: "Queue at border" }).expect(200);
      const alerts = await asDispatcher(api().get("/api/traffic/alerts")).expect(200);
      expect(alerts.body[0]).toMatchObject({ kind: "delay-reported", cargoId: cargo.id, severity: "warning" });

      await asDriver(api().post(`/api/me/trip/${cargo.id}/delivered`)).expect(200);
      expect(await status("trucks", truck.id)).toBe("available");
      expect(await status("drivers", driver.id)).toBe("available");
    });

    it("stops drivers from touching other drivers' loads", async () => {
      const other = await newCargo("P1", "D1");
      await asDriver(api().post(`/api/me/trip/${other.id}/picked-up`)).expect(403);
      await asDispatcher(api().delete(`/api/cargos/${other.id}`)).expect(204);
    });

    it("keeps a truck taken until its last queued load is delivered, driving them in order", async () => {
      const first = await newCargo("P1", "D1", { truckId: truck.id, pickupDate: "2026-01-01" });
      const second = await newCargo("P2", "D2", { truckId: truck.id, pickupDate: "2026-01-02" });
      const simulator = app.get(SimulatedTelematicsProvider);
      const sink = async () => undefined;
      const cargoStatus = async (id: string) => (await asDispatcher(api().get(`/api/cargos/${id}`))).body.status;

      // One tick covers the whole first load (see PLACES).
      await simulator.plan();
      await simulator.tick(sink);
      expect(await cargoStatus(first.id)).toBe("delivered");
      expect(await cargoStatus(second.id)).toBe("new");
      expect(await status("trucks", truck.id)).toBe("taken");

      // The truck's last position is the first delivery, so it drives on to the second load.
      await webhook([{ vehicleId: "TRIP-1", lng: PLACES.D1[0], lat: PLACES.D1[1] }]);
      await simulator.plan();
      await simulator.tick(sink);
      await simulator.tick(sink);
      expect(await cargoStatus(second.id)).toBe("delivered");
      expect(await status("trucks", truck.id)).toBe("available");
    });

    it("reports traffic delays, closures and unaccepted restrictions once per new problem", async () => {
      const cargo = await newCargo("P1", "D1", { truckId: truck.id });
      router.route.mockImplementation(async (request: RouteRequest) => {
        const [plan] = await fakeRoute(request);
        return [
          {
            ...plan,
            durationS: plan.durationS + 1800,
            typicalDurationS: plan.durationS,
            incidents: [{ id: "x1", type: "accident", description: "Crash", impact: "major", closed: true }],
            notices: [{ type: "violation", subtype: "maxHeight", message: "Vehicle is 0.2 m too tall" }],
          },
        ];
      });
      try {
        const traffic = app.get(TrafficService);
        await traffic.run();
        await traffic.run();
        const report = await asDispatcher(api().get("/api/traffic/report")).expect(200);
        const trip = report.body.trips.find((t: { cargoId: string }) => t.cargoId === cargo.id);
        expect(trip).toMatchObject({ truckNumber: "TRIP-1", trafficDelayS: 1800, nextStop: { kind: "pickup" } });

        const alerts = (await asDispatcher(api().get("/api/traffic/alerts"))).body.filter(
          (a: { cargoId: string }) => a.cargoId === cargo.id,
        );
        expect(alerts.map((a: { kind: string }) => a.kind).sort()).toEqual(["incident", "route-restriction", "traffic-delay"]);
        expect(trip).toMatchObject({ restrictionsAccepted: false, violations: [{ message: "Vehicle is 0.2 m too tall" }] });
        expect(alerts.find((a: { kind: string }) => a.kind === "incident").severity).toBe("critical");
      } finally {
        router.route.mockImplementation(fakeRoute);
        await asDispatcher(api().delete(`/api/cargos/${cargo.id}`)).expect(204);
      }
    });

    it("routes a load on board from the truck straight to delivery", async () => {
      const cargo = await newCargo("P1", "D1", { truckId: truck.id, driverId: driver.id });
      const before = await asDispatcher(api().get(`/api/cargos/${cargo.id}/route?from=40,0`)).expect(200);
      expect(before.body).toMatchObject({ pickedUp: false, routes: [{ legs: [{}, {}] }] });

      await asDriver(api().post(`/api/me/trip/${cargo.id}/picked-up`)).expect(200);
      const after = await asDispatcher(api().get(`/api/cargos/${cargo.id}/route?from=40,0`)).expect(200);
      expect(after.body).toMatchObject({ pickedUp: true });
      expect(router.route).toHaveBeenLastCalledWith(expect.objectContaining({ coordinates: [[40, 0], PLACES.D1] }));
      await asDriver(api().post(`/api/me/trip/${cargo.id}/delivered`)).expect(200);
    });

    it("shows driver road reports on an active trip's route and alerts dispatchers", async () => {
      await webhook([{ vehicleId: "TRIP-1", lng: 40, lat: 0 }]).expect(202);
      const cargo = await newCargo("P1", "D1", { truckId: truck.id, driverId: driver.id });
      const traffic = app.get(TrafficService);
      await traffic.run();

      // Dana's report is pinned at her truck, where the trip's remaining route starts.
      const posted = await asDriver(api().post("/api/road-reports")).send({ type: "accident", note: "Two lanes blocked" }).expect(201);
      try {
        const report = await asDispatcher(api().get("/api/traffic/report")).expect(200);
        const trip = report.body.trips.find((t: { cargoId: string }) => t.cargoId === cargo.id);
        expect(trip).toMatchObject({
          geometry: [[40, 0], PLACES.P1, PLACES.D1],
          roadReports: [{ id: posted.body.id, type: "accident", label: "Accident", note: "Two lanes blocked" }],
        });
        expect(trip.toPickupM).toBeGreaterThan(0);

        const alerts = (await asDispatcher(api().get("/api/traffic/alerts"))).body.filter(
          (a: { cargoId: string; kind: string }) => a.cargoId === cargo.id && a.kind === "road-report",
        );
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatchObject({ severity: "warning" });
        expect(alerts[0].message).toContain("Two lanes blocked");

        // The next check finds the same report again but doesn't alert twice.
        await traffic.run();
        const again = (await asDispatcher(api().get("/api/traffic/alerts"))).body.filter(
          (a: { cargoId: string; kind: string }) => a.cargoId === cargo.id && a.kind === "road-report",
        );
        expect(again).toHaveLength(1);
      } finally {
        await asDispatcher(api().delete(`/api/road-reports/${posted.body.id}`)).expect(204);
        await asDispatcher(api().delete(`/api/cargos/${cargo.id}`)).expect(204);
      }
    });

    it("reuses an active trip's route until the truck leaves it", async () => {
      const cargo = await newCargo("P1", "D1", { truckId: truck.id, driverId: driver.id });
      try {
        router.route.mockClear();
        for (let i = 0; i < 3; i++) await asDriver(api().get("/api/me/trip")).expect(200);
        await app.get(TrafficService).run();
        expect(router.route).toHaveBeenCalledTimes(1);

        // ~11 km off the planned route: the next poll plans a new one from the truck.
        await webhook([{ vehicleId: "TRIP-1", lng: 40.1, lat: 0 }]).expect(202);
        const after = await asDriver(api().get("/api/me/trip")).expect(200);
        expect(router.route).toHaveBeenCalledTimes(2);
        expect(after.body.trip.route.geometry.coordinates[0]).toEqual([40.1, 0]);
      } finally {
        await webhook([{ vehicleId: "TRIP-1", lng: 40, lat: 0 }]).expect(202);
        await asDispatcher(api().delete(`/api/cargos/${cargo.id}`)).expect(204);
      }
    });
  });

  describe("voice commands", () => {
    const asDispatcher = <T extends request.Test>(req: T) => req.auth(dispatcherToken, { type: "bearer" });
    let driverToken: string;
    let cargo: { id: string };

    beforeAll(async () => {
      const truck = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "VOICE-1" })).body;
      const driver = (
        await asDispatcher(api().post("/api/drivers")).send({ firstName: "Vic", lastName: "Voice", truckDriverEmail: "vic@test.local" })
      ).body;
      await asDispatcher(api().post(`/api/drivers/${driver.id}/account`)).send({ password: "driverpass1" }).expect(201);
      driverToken = (await api().post("/api/auth/login").send({ email: "vic@test.local", password: "driverpass1" })).body.accessToken;
      cargo = (
        await asDispatcher(api().post("/api/cargos")).send({ pickupLocation: "Dallas", deliveryLocation: "Chicago", truckId: truck.id, driverId: driver.id })
      ).body;
    });

    const asDriver = <T extends request.Test>(req: T) => req.auth(driverToken, { type: "bearer" });
    const interpret = (transcript: string) => asDriver(api().post("/api/me/voice/interpret")).send({ transcript }).expect(200);

    it("proposes a delay report and only reports it once confirmed", async () => {
      const proposal = await interpret("I'm 30 minutes late because of heavy rain");
      expect(proposal.body).toMatchObject({
        parser: "rules",
        needsConfirmation: true,
        cargoId: cargo.id,
        intent: { action: "report_delay", delayMinutes: 30, reason: "heavy rain" },
      });
      expect(proposal.body.reply).toContain("30 minute delay");
      expect((await asDispatcher(api().get(`/api/cargos/${cargo.id}`))).body.delayMinutes).toBeNull();

      await asDriver(api().post("/api/me/voice/execute"))
        .send({ action: "report_delay", cargoId: cargo.id, delayMinutes: 30, reason: "heavy rain" })
        .expect(200);
      expect((await asDispatcher(api().get(`/api/cargos/${cargo.id}`))).body).toMatchObject({ delayMinutes: 30, delayReason: "heavy rain" });
    });

    it("asks for the minutes when a delay has no amount", async () => {
      const proposal = await interpret("I will have a delayed pickup");
      expect(proposal.body.intent).toMatchObject({ action: "report_delay", delayMinutes: null });
      expect(proposal.body.reply).toMatch(/How many minutes/);
      await asDriver(api().post("/api/me/voice/execute")).send({ action: "report_delay", cargoId: cargo.id }).expect(400);
    });

    it("changes the delivery address, re-geocodes it and tells dispatch", async () => {
      const proposal = await interpret("set the delivery destination to Walmart DC Temple");
      expect(proposal.body.intent).toMatchObject({ action: "set_delivery_location", location: "Walmart DC Temple" });

      await asDriver(api().post("/api/me/voice/execute"))
        .send({ action: "set_delivery_location", cargoId: cargo.id, location: "Walmart DC Temple" })
        .expect(200);
      const updated = (await asDispatcher(api().get(`/api/cargos/${cargo.id}`))).body;
      expect(updated).toMatchObject({ deliveryLocation: "Walmart DC Temple", deliveryPoint: { x: -97.34, y: 31.1 } });
      const alerts = (await asDispatcher(api().get("/api/traffic/alerts"))).body;
      expect(alerts[0]).toMatchObject({ kind: "address-changed", cargoId: cargo.id });
    });

    it("answers next-stop questions without changing anything", async () => {
      const answer = await interpret("what's my next stop");
      expect(answer.body).toMatchObject({ needsConfirmation: false, intent: { action: "next_stop" } });
      expect(answer.body.reply).toContain("Pickup in Dallas");
    });

    it("refuses to act on a load that isn't the driver's current one", async () => {
      const other = (await asDispatcher(api().post("/api/cargos")).send({ pickupLocation: "Dallas", deliveryLocation: "Chicago" })).body;
      await asDriver(api().post("/api/me/voice/execute")).send({ action: "confirm_pickup", cargoId: other.id }).expect(400);
      await asDispatcher(api().post("/api/me/voice/interpret")).send({ transcript: "delivered" }).expect(403);
    });
  });

  describe("load boards", () => {
    const asDispatcher = <T extends request.Test>(req: T) => req.auth(dispatcherToken, { type: "bearer" });

    it("lists loads per region and equipment", async () => {
      const us = (await asDispatcher(api().get("/api/loadboards/loads?region=US")).expect(200)).body;
      expect(us.length).toBeGreaterThan(5);
      expect(us.every((load: { region: string; rate: { currency: string } }) => load.region === "US" && load.rate.currency === "USD")).toBe(true);
      // The demo is US-only for now.
      expect((await asDispatcher(api().get("/api/loadboards/loads?region=EU")).expect(200)).body).toEqual([]);

      const reefers = (await asDispatcher(api().get("/api/loadboards/loads?equipment=Reefer")).expect(200)).body;
      expect(reefers.length).toBeGreaterThan(0);
      expect(reefers.every((load: { equipment: string }) => load.equipment === "Reefer")).toBe(true);
      await api().get("/api/loadboards/loads").expect(401);
    });

    it("imports a load once, with coordinates, and flags it as imported", async () => {
      const [load] = (await asDispatcher(api().get("/api/loadboards/loads?region=US")).expect(200)).body;
      const first = await asDispatcher(api().post(`/api/loadboards/${load.board}/loads/${load.id}/import`)).expect(200);
      expect(first.body).toMatchObject({
        created: true,
        cargo: {
          source: load.board,
          externalId: load.id,
          pickupLocation: load.origin.city,
          deliveryLocation: load.destination.city,
          pickupPoint: { x: load.origin.point[0], y: load.origin.point[1] },
          status: "new",
        },
      });
      const again = await asDispatcher(api().post(`/api/loadboards/${load.board}/loads/${load.id}/import`)).expect(200);
      expect(again.body).toMatchObject({ created: false, cargo: { id: first.body.cargo.id } });

      const listed = (await asDispatcher(api().get("/api/loadboards/loads?region=US"))).body.find((l: { id: string }) => l.id === load.id);
      expect(listed.cargoId).toBe(first.body.cargo.id);
      await asDispatcher(api().post(`/api/loadboards/${load.board}/loads/nope/import`)).expect(404);
    });

    it("auto-imports the loads our company booked, once", async () => {
      const first = (await asDispatcher(api().post("/api/loadboards/sync")).expect(200)).body;
      expect(first.imported.length).toBeGreaterThan(0);
      const second = (await asDispatcher(api().post("/api/loadboards/sync")).expect(200)).body;
      expect(second.imported).toEqual([]);
      const alerts = (await asDispatcher(api().get("/api/traffic/alerts"))).body;
      expect(alerts.find((a: { kind: string }) => a.kind === "loads-imported")).toBeDefined();
    });
  });

  describe("rate limiting", () => {
    it("blocks repeated failed logins from one client", async () => {
      // Separate app instance with the production default, so other tests aren't throttled.
      process.env.LOGIN_RATE_LIMIT = "3";
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(GeocodingService)
        .useValue(geocoder)
        .overrideProvider(RoutingService)
        .useValue(router)
        .compile();
      const strict = moduleRef.createNestApplication();
      setupApp(strict);
      await strict.init();
      try {
        const attempt = () =>
          request(strict.getHttpServer()).post("/api/auth/login").send({ email: "admin@test.local", password: "wrong" });
        for (let i = 0; i < 3; i++) await attempt().expect(401);
        await attempt().expect(429);
      } finally {
        await strict.close();
        process.env.LOGIN_RATE_LIMIT = "1000";
      }
    });
  });

  describe("driver-confirmed stops", () => {
    it("drives app drivers to the next stop and waits for them to confirm", async () => {
      const asDispatcher = <T extends request.Test>(req: T) => req.auth(dispatcherToken, { type: "bearer" });
      const truck = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "APP-1" })).body;
      const driver = (
        await asDispatcher(api().post("/api/drivers")).send({ firstName: "Ann", lastName: "App", truckDriverEmail: "ann@test.local" })
      ).body;
      await asDispatcher(api().post(`/api/drivers/${driver.id}/account`)).send({ password: "driverpass1" }).expect(201);
      const driverToken = (await api().post("/api/auth/login").send({ email: "ann@test.local", password: "driverpass1" })).body.accessToken;
      await api()
        .post("/api/telematics/webhook")
        .set("x-telematics-secret", "test-webhook-secret")
        .send({ positions: [{ vehicleId: "APP-1", lng: 40, lat: 0 }] })
        .expect(202);
      const cargo = (
        await asDispatcher(api().post("/api/cargos")).send({ pickupLocation: "P1", deliveryLocation: "D1", truckId: truck.id, driverId: driver.id })
      ).body;

      const simulator = app.get(SimulatedTelematicsProvider);
      const fixes: PositionFix[] = [];
      const sink = async (batch: PositionFix[]) => fixes.push(...batch);
      const cargoStatus = async () => (await asDispatcher(api().get(`/api/cargos/${cargo.id}`))).body.status;
      const lastFix = () => fixes.filter((f) => f.truckId === truck.id).pop()!;

      // Drives only to the pickup and stops there; nothing is confirmed for the driver.
      await simulator.plan();
      expect(router.route).toHaveBeenLastCalledWith(expect.objectContaining({ coordinates: [[40, 0], PLACES.P1] }));
      await simulator.tick(sink);
      await simulator.tick(sink);
      expect(lastFix()).toMatchObject({ point: PLACES.P1, speedKmh: 0 });
      expect(await cargoStatus()).toBe("new");

      // The driver confirms; the next plan heads for the delivery and waits there too.
      await api().post(`/api/me/trip/${cargo.id}/picked-up`).auth(driverToken, { type: "bearer" }).expect(200);
      await webhookTo("APP-1", PLACES.P1);
      await simulator.plan();
      expect(router.route).toHaveBeenLastCalledWith(expect.objectContaining({ coordinates: [PLACES.P1, PLACES.D1] }));
      await simulator.tick(sink);
      await simulator.tick(sink);
      expect(lastFix()).toMatchObject({ point: PLACES.D1, speedKmh: 0 });
      expect(await cargoStatus()).toBe("picked_up");

      await api().post(`/api/me/trip/${cargo.id}/delivered`).auth(driverToken, { type: "bearer" }).expect(200);
      expect(await cargoStatus()).toBe("delivered");
    });

    const webhookTo = (vehicleId: string, [lng, lat]: LngLat) =>
      api().post("/api/telematics/webhook").set("x-telematics-secret", "test-webhook-secret").send({ positions: [{ vehicleId, lng, lat }] });
  });

  describe("vehicle records", () => {
    const asDispatcher = <T extends request.Test>(req: T) => req.auth(dispatcherToken, { type: "bearer" });
    let truck: { id: string };
    let trailer: { id: string };
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

    beforeAll(async () => {
      truck = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "DOC-1", odometerKm: 100000 })).body;
      trailer = (await asDispatcher(api().post("/api/trailers")).send({ trailerNumber: "DOC-T1", trailer: "Reefer" })).body;
    });

    it("stores documents with an attached scan and serves it back", async () => {
      const pdf = Buffer.from("%PDF-1.4 test document");
      const created = await asDispatcher(api().post(`/api/trucks/${truck.id}/documents`))
        .field("type", "insurance")
        .field("number", "POL-123")
        .field("expiresOn", day(12))
        .attach("file", pdf, { filename: "Polica 2026.pdf", contentType: "application/pdf" })
        .expect(201);
      expect(created.body).toMatchObject({
        type: "insurance",
        title: "Insurance",
        number: "POL-123",
        status: "expiring",
        daysLeft: 12,
        hasFile: true,
        fileName: "Polica 2026.pdf",
      });
      expect(created.body.fileKey).toBeUndefined();

      const file = await asDispatcher(api().get(`/api/vehicle-documents/${created.body.id}/file`)).expect(200);
      expect(file.headers["content-type"]).toContain("application/pdf");
      expect(file.headers["content-disposition"]).toContain("inline");
      expect(Buffer.from(file.body).toString()).toBe(pdf.toString());

      const filesBefore = readdirSync(UPLOAD_DIR).length;
      await asDispatcher(api().delete(`/api/trucks/${truck.id}/documents/${created.body.id}`)).expect(204);
      expect(readdirSync(UPLOAD_DIR).length).toBe(filesBefore - 1);
    });

    it("rejects unsupported and oversized files", async () => {
      await asDispatcher(api().post(`/api/trucks/${truck.id}/documents`))
        .field("type", "permit")
        .attach("file", Buffer.from("#!/bin/sh"), { filename: "run.sh", contentType: "application/x-sh" })
        .expect(400);
      await asDispatcher(api().post(`/api/trucks/${truck.id}/documents`))
        .field("type", "permit")
        .attach("file", Buffer.alloc(11 * 1024 * 1024), { filename: "big.pdf", contentType: "application/pdf" })
        .expect(413);
    });

    it("tracks maintenance by date and distance, and logs completed checks", async () => {
      const oil = (
        await asDispatcher(api().post(`/api/trucks/${truck.id}/maintenance`))
          .send({ title: "Engine oil", type: "oil_change", intervalKm: 60000, intervalDays: 365, lastDoneOn: day(-30), lastDoneKm: 41000 })
          .expect(201)
      ).body;
      // Due at 41,000 + 60,000 = 101,000 km; the truck is at 100,000, so 1,000 km left.
      expect(oil).toMatchObject({ status: "due_soon", nextDueKm: 101000, kmLeft: 1000 });

      const done = await asDispatcher(api().post(`/api/trucks/${truck.id}/maintenance/${oil.id}/done`))
        .send({ odometerKm: 100500, cost: 420, currency: "EUR", notes: "Synthetic 10W-40" })
        .expect(200);
      expect(done.body).toMatchObject({ status: "ok", lastDoneOn: day(0), lastDoneKm: 100500, nextDueKm: 160500 });

      const log = (await asDispatcher(api().get(`/api/trucks/${truck.id}/log`))).body;
      expect(log[0]).toMatchObject({ kind: "service", title: "Engine oil", odometerKm: 100500, cost: 420, maintenanceItemId: oil.id });
      expect((await asDispatcher(api().get(`/api/trucks/${truck.id}`))).body.odometerKm).toBe(100500);
    });

    it("adds a standard checklist only once", async () => {
      const first = await asDispatcher(api().post(`/api/trailers/${trailer.id}/maintenance/checklist`)).send({ checklist: "trailer" }).expect(200);
      const again = await asDispatcher(api().post(`/api/trailers/${trailer.id}/maintenance/checklist`)).send({ checklist: "trailer" }).expect(200);
      expect([first.body.added, again.body.added]).toEqual([4, 0]);
      const items = (await asDispatcher(api().get(`/api/trailers/${trailer.id}/maintenance`))).body;
      expect(items.every((i: { status: string }) => i.status === "not_started")).toBe(true);
    });

    it("keeps a notepad and only moves the odometer forward", async () => {
      await asDispatcher(api().post(`/api/trucks/${truck.id}/log`)).send({ title: "Small dent, rear left", kind: "damage", odometerKm: 90000 }).expect(201);
      expect((await asDispatcher(api().get(`/api/trucks/${truck.id}`))).body.odometerKm).toBe(100500);
      const note = (await asDispatcher(api().post(`/api/trucks/${truck.id}/log`)).send({ title: "Driver reports noisy fan", odometerKm: 101200 })).body;
      expect(note).toMatchObject({ kind: "note", entryDate: day(0), authorEmail: "dispatcher@test.local" });
      expect((await asDispatcher(api().get(`/api/trucks/${truck.id}`))).body.odometerKm).toBe(101200);
      await asDispatcher(api().delete(`/api/trucks/${truck.id}/log/${note.id}`)).expect(204);
    });

    it("lists what needs attention across the fleet", async () => {
      await asDispatcher(api().post(`/api/trailers/${trailer.id}/documents`)).field("type", "technical_inspection").field("expiresOn", day(-3)).expect(201);
      await asDispatcher(api().post(`/api/trucks/${truck.id}/maintenance`))
        .send({ title: "Brakes", type: "brakes", intervalDays: 182, lastDoneOn: day(-200) })
        .expect(201);
      const attention = (await asDispatcher(api().get("/api/fleet/attention")).expect(200)).body;
      expect(attention).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ vehicleLabel: "DOC-T1", recordType: "document", status: "expired", daysLeft: -3 }),
          expect.objectContaining({ vehicleLabel: "DOC-1", recordType: "maintenance", title: "Brakes", status: "overdue" }),
        ]),
      );
      // Most urgent first.
      expect(["expired", "overdue"]).toContain(attention[0].status);
    });

    it("keeps records to staff and to the right vehicle", async () => {
      await api().get(`/api/trucks/${truck.id}/documents`).auth(driverToken, { type: "bearer" }).expect(403);
      const doc = (await asDispatcher(api().post(`/api/trucks/${truck.id}/documents`)).field("type", "permit")).body;
      await asDispatcher(api().delete(`/api/trailers/${trailer.id}/documents/${doc.id}`)).expect(404);
      expect(existsSync(UPLOAD_DIR)).toBe(true);
    });
  });

  describe("driver community", () => {
    const asDispatcher = <T extends request.Test>(req: T) => req.auth(dispatcherToken, { type: "bearer" });
    const webhook = (vehicleId: string, [lng, lat]: LngLat) =>
      api().post("/api/telematics/webhook").set("x-telematics-secret", "test-webhook-secret").send({ positions: [{ vehicleId, lng, lat }] });
    const newDriver = async (firstName: string, email: string, extra: object = {}) => {
      const driver = (
        await asDispatcher(api().post("/api/drivers"))
          .send({ firstName, lastName: "Road", truckDriverEmail: email, phoneNumber: "+359 888 000 111", ...extra })
          .expect(201)
      ).body;
      await asDispatcher(api().post(`/api/drivers/${driver.id}/account`)).send({ password: "driverpass1" }).expect(201);
      const token = (await api().post("/api/auth/login").send({ email, password: "driverpass1" })).body.accessToken;
      return { driver, token };
    };

    let truck: { id: string };
    let rita: { driver: { id: string }; token: string };
    let otto: { driver: { id: string }; token: string };

    beforeAll(async () => {
      truck = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "COMM-1" })).body;
      await webhook("COMM-1", [30, 10]).expect(202);
      // Rita has no load; her report is placed at the truck on her profile.
      rita = await newDriver("Rita", "rita@test.local", { truckNumber: "COMM-1" });
      otto = await newDriver("Otto", "otto@test.local");
    });

    it("pins one-tap reports at the truck's position and shares them with everyone", async () => {
      const created = await api().post("/api/road-reports").auth(rita.token, { type: "bearer" }).send({ type: "police" }).expect(201);
      expect(created.body).toMatchObject({ type: "police", label: "Police", point: [30, 10], reporter: { driverId: rita.driver.id, truckNumber: "COMM-1" } });
      const hours = (new Date(created.body.expiresAt).getTime() - Date.now()) / 3_600_000;
      expect(hours).toBeGreaterThan(1.9);
      expect(hours).toBeLessThanOrEqual(2);

      // Tapping again on the spot refreshes the same report instead of adding another.
      const again = await api().post("/api/road-reports").auth(rita.token, { type: "bearer" }).send({ type: "police" }).expect(201);
      expect(again.body.id).toBe(created.body.id);

      const seenByOtto = await api().get("/api/road-reports").auth(otto.token, { type: "bearer" }).expect(200);
      expect(seenByOtto.body.reports.filter((r: { id: string }) => r.id === created.body.id)).toHaveLength(1);
      expect(seenByOtto.body.position).toBeNull();
      const seenByRita = await api().get("/api/road-reports").auth(rita.token, { type: "bearer" }).expect(200);
      expect(seenByRita.body.position).toEqual([30, 10]);
      await asDispatcher(api().get("/api/road-reports")).expect(200);

      await api().delete(`/api/road-reports/${created.body.id}`).auth(otto.token, { type: "bearer" }).expect(403);
      await api().delete(`/api/road-reports/${created.body.id}`).auth(rita.token, { type: "bearer" }).expect(204);
      const after = await api().get("/api/road-reports").auth(otto.token, { type: "bearer" }).expect(200);
      expect(after.body.reports.some((r: { id: string }) => r.id === created.body.id)).toBe(false);
    });

    it("rejects reports it can't place and unknown report types", async () => {
      await api().post("/api/road-reports").auth(otto.token, { type: "bearer" }).send({ type: "police" }).expect(422);
      await api().post("/api/road-reports").auth(rita.token, { type: "bearer" }).send({ type: "aliens" }).expect(400);
      await asDispatcher(api().post("/api/road-reports")).send({ type: "police" }).expect(403);
    });

    it("pushes new reports and chat messages to drivers live", async () => {
      const socket: Socket = io(liveUrl(), { auth: { token: otto.token }, transports: ["websocket"] });
      try {
        await new Promise<void>((resolve, reject) => {
          socket.on("connect", resolve);
          socket.on("connect_error", reject);
        });
        const report = new Promise((resolve) => socket.on("road-report", resolve));
        const message = new Promise((resolve) => socket.on("chat-message", resolve));
        await api().post("/api/road-reports").auth(rita.token, { type: "bearer" }).send({ type: "roadworks", note: "Right lane closed" }).expect(201);
        await api().post("/api/community/messages").auth(rita.token, { type: "bearer" }).send({ body: "Anyone near COMM-1?" }).expect(201);
        expect(await report).toMatchObject({ type: "roadworks", note: "Right lane closed" });
        expect(await message).toMatchObject({ body: "Anyone near COMM-1?", sender: { name: "Rita Road" } });
      } finally {
        socket.close();
      }
    });

    it("lets drivers chat and call each other", async () => {
      await api().post("/api/community/messages").auth(otto.token, { type: "bearer" }).send({ body: "  Coffee at the border?  " }).expect(201);
      await api().post("/api/community/messages").auth(otto.token, { type: "bearer" }).send({ body: "   " }).expect(400);
      const messages = (await api().get("/api/community/messages").auth(rita.token, { type: "bearer" }).expect(200)).body;
      expect(messages[messages.length - 1]).toMatchObject({
        body: "Coffee at the border?",
        sender: { driverId: otto.driver.id, name: "Otto Road", phoneNumber: "+359 888 000 111" },
      });

      const directory = (await api().get("/api/community/drivers").auth(rita.token, { type: "bearer" }).expect(200)).body;
      expect(directory).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: otto.driver.id, phoneNumber: "+359 888 000 111", usesApp: true })]),
      );
      await asDispatcher(api().get("/api/community/messages")).expect(403);
    });

    it("lists a driver's completed deliveries", async () => {
      const cargo = (
        await asDispatcher(api().post("/api/cargos"))
          .send({ pickupLocation: "P1", deliveryLocation: "D1", truckId: truck.id, driverId: rita.driver.id })
          .expect(201)
      ).body;
      expect((await api().get("/api/me/history").auth(rita.token, { type: "bearer" }).expect(200)).body.total).toBe(0);
      await api().post(`/api/me/trip/${cargo.id}/picked-up`).auth(rita.token, { type: "bearer" }).expect(200);
      await api().post(`/api/me/trip/${cargo.id}/delivered`).auth(rita.token, { type: "bearer" }).expect(200);

      const history = (await api().get("/api/me/history").auth(rita.token, { type: "bearer" }).expect(200)).body;
      expect(history.total).toBe(1);
      expect(history.deliveries[0]).toMatchObject({ id: cargo.id, pickupLocation: "P1", deliveryLocation: "D1", truckNumber: "COMM-1" });
      expect((await api().get("/api/me/history").auth(otto.token, { type: "bearer" }).expect(200)).body.total).toBe(0);
    });
  });
});
