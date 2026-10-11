import { RouteRequest } from "../../src/routing/routing.types";
import { SimulatedTelematicsProvider } from "../../src/telematics/simulated-telematics.provider";
import { TrafficService } from "../../src/trips/traffic.service";
import { alertsFor, moveTruck, newCargo, newDriverWithLogin, newTruck } from "../support/actors";
import { createTestApp, TestApp } from "../support/app";
import { fakeRoute, PLACES, router } from "../support/fakes";

describe("trips (e2e)", () => {
  let t: TestApp;
  let truck: { id: string };
  let driver: { id: string };
  let asDriver: TestApp["asDispatcher"];

  const status = async (kind: "trucks" | "drivers", id: string) =>
    (await t.asDispatcher(t.api().get(`/api/${kind}/${id}`))).body.status;
  const cargoStatus = async (id: string) => (await t.asDispatcher(t.api().get(`/api/cargos/${id}`))).body.status;
  const removeCargo = (id: string) => t.asDispatcher(t.api().delete(`/api/cargos/${id}`)).expect(204);

  beforeAll(async () => {
    t = await createTestApp();
    truck = await newTruck(t, { truckNumber: "TRIP-1" });
    await moveTruck(t, "TRIP-1", [40, 0]).expect(202);
    const dana = await newDriverWithLogin(t, { firstName: "Dana", lastName: "Driver", email: "dana@test.local" });
    driver = dana.driver;
    asDriver = t.as(dana.token);
  });
  afterAll(() => t.close());

  it("refuses a second login for the same driver", async () => {
    await t.asDispatcher(t.api().post(`/api/drivers/${driver.id}/account`)).send({ password: "driverpass1" }).expect(409);
  });

  it("ranks unassigned loads by drive time to their pickup", async () => {
    const near = await newCargo(t, "P2", "D2", { pickupDate: "2999-01-01" });
    const far = await newCargo(t, "Far", "D1");
    const res = await t.asDispatcher(t.api().get(`/api/trucks/${truck.id}/next-pickups`)).expect(200);

    expect(res.body.origin).toMatchObject({ point: [40, 0], after: "current-position" });
    const ids = res.body.candidates.map((c: { cargo: { id: string } }) => c.cargo.id);
    expect(ids[0]).toBe(near.id);
    expect(ids.indexOf(far.id)).toBeGreaterThan(0);
    expect(res.body.candidates[0]).toMatchObject({ onTime: true });
    const durations = res.body.candidates.map((c: { durationS: number }) => c.durationS);
    expect(durations).toEqual([...durations].sort((a, b) => a - b));

    await removeCargo(near.id);
    await removeCargo(far.id);
  });

  it("gives the driver their trip and lets them work it", async () => {
    expect((await asDriver(t.api().get("/api/me/trip")).expect(200)).body.trip).toBeNull();
    await t.asDispatcher(t.api().get("/api/me/trip")).expect(403);

    const cargo = await newCargo(t, "P1", "D1", { truckId: truck.id, driverId: driver.id });
    const mine = await asDriver(t.api().get("/api/me/trip")).expect(200);
    expect(mine.body.trip).toMatchObject({
      cargo: { id: cargo.id },
      nextStop: { kind: "pickup", point: PLACES.P1 },
      route: { geometry: { coordinates: [[40, 0], PLACES.P1, PLACES.D1] } },
    });

    await asDriver(t.api().post(`/api/me/trip/${cargo.id}/delivered`)).expect(409);
    await asDriver(t.api().post(`/api/me/trip/${cargo.id}/picked-up`)).expect(200);
    expect((await asDriver(t.api().get("/api/me/trip"))).body.trip.nextStop).toMatchObject({ kind: "delivery" });

    await asDriver(t.api().post(`/api/me/trip/${cargo.id}/delay`)).send({ minutes: 45, reason: "Queue at border" }).expect(200);
    expect(await alertsFor(t, cargo.id, "delay-reported")).toEqual([expect.objectContaining({ severity: "warning" })]);

    await asDriver(t.api().post(`/api/me/trip/${cargo.id}/delivered`)).expect(200);
    expect(await status("trucks", truck.id)).toBe("available");
    expect(await status("drivers", driver.id)).toBe("available");
  });

  it("stops drivers from touching other drivers' loads", async () => {
    const other = await newCargo(t, "P1", "D1");
    await asDriver(t.api().post(`/api/me/trip/${other.id}/picked-up`)).expect(403);
    await removeCargo(other.id);
  });

  it("keeps a truck taken until its last queued load is delivered, driving them in order", async () => {
    const first = await newCargo(t, "P1", "D1", { truckId: truck.id, pickupDate: "2026-01-01" });
    const second = await newCargo(t, "P2", "D2", { truckId: truck.id, pickupDate: "2026-01-02" });
    const simulator = t.app.get(SimulatedTelematicsProvider);
    const sink = async () => undefined;

    // One tick covers the whole first load (see PLACES).
    await simulator.plan();
    await simulator.tick(sink);
    expect(await cargoStatus(first.id)).toBe("delivered");
    expect(await cargoStatus(second.id)).toBe("new");
    expect(await status("trucks", truck.id)).toBe("taken");

    // The truck's last position is the first delivery, so it drives on to the second load.
    await moveTruck(t, "TRIP-1", PLACES.D1);
    await simulator.plan();
    await simulator.tick(sink);
    await simulator.tick(sink);
    expect(await cargoStatus(second.id)).toBe("delivered");
    expect(await status("trucks", truck.id)).toBe("available");
  });

  it("reports traffic delays, closures and unaccepted restrictions once per new problem", async () => {
    const cargo = await newCargo(t, "P1", "D1", { truckId: truck.id });
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
      const traffic = t.app.get(TrafficService);
      await traffic.run();
      await traffic.run();
      const report = await t.asDispatcher(t.api().get("/api/traffic/report")).expect(200);
      const trip = report.body.trips.find((trip: { cargoId: string }) => trip.cargoId === cargo.id);
      expect(trip).toMatchObject({ truckNumber: "TRIP-1", trafficDelayS: 1800, nextStop: { kind: "pickup" } });

      const alerts = await alertsFor(t, cargo.id);
      expect(alerts.map((a: { kind: string }) => a.kind).sort()).toEqual(["incident", "route-restriction", "traffic-delay"]);
      expect(trip).toMatchObject({ restrictionsAccepted: false, violations: [{ message: "Vehicle is 0.2 m too tall" }] });
      expect(alerts.find((a: { kind: string }) => a.kind === "incident").severity).toBe("critical");
    } finally {
      router.route.mockImplementation(fakeRoute);
      await removeCargo(cargo.id);
    }
  });

  it("routes a load on board from the truck straight to delivery", async () => {
    const cargo = await newCargo(t, "P1", "D1", { truckId: truck.id, driverId: driver.id });
    const before = await t.asDispatcher(t.api().get(`/api/cargos/${cargo.id}/route?from=40,0`)).expect(200);
    expect(before.body).toMatchObject({ pickedUp: false, routes: [{ legs: [{}, {}] }] });

    await asDriver(t.api().post(`/api/me/trip/${cargo.id}/picked-up`)).expect(200);
    const after = await t.asDispatcher(t.api().get(`/api/cargos/${cargo.id}/route?from=40,0`)).expect(200);
    expect(after.body).toMatchObject({ pickedUp: true });
    expect(router.route).toHaveBeenLastCalledWith(expect.objectContaining({ coordinates: [[40, 0], PLACES.D1] }));
    await asDriver(t.api().post(`/api/me/trip/${cargo.id}/delivered`)).expect(200);
  });

  it("shows driver road reports on an active trip's route and alerts dispatchers", async () => {
    await moveTruck(t, "TRIP-1", [40, 0]).expect(202);
    const cargo = await newCargo(t, "P1", "D1", { truckId: truck.id, driverId: driver.id });
    const traffic = t.app.get(TrafficService);
    await traffic.run();

    // Dana's report is pinned at her truck, where the trip's remaining route starts.
    const posted = await asDriver(t.api().post("/api/road-reports")).send({ type: "accident", note: "Two lanes blocked" }).expect(201);
    try {
      const report = await t.asDispatcher(t.api().get("/api/traffic/report")).expect(200);
      const trip = report.body.trips.find((trip: { cargoId: string }) => trip.cargoId === cargo.id);
      expect(trip).toMatchObject({
        geometry: [[40, 0], PLACES.P1, PLACES.D1],
        roadReports: [{ id: posted.body.id, type: "accident", label: "Accident", note: "Two lanes blocked" }],
      });
      expect(trip.toPickupM).toBeGreaterThan(0);

      const alerts = await alertsFor(t, cargo.id, "road-report");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ severity: "warning" });
      expect(alerts[0].message).toContain("Two lanes blocked");

      // The next check finds the same report again but doesn't alert twice.
      await traffic.run();
      expect(await alertsFor(t, cargo.id, "road-report")).toHaveLength(1);
    } finally {
      await t.asDispatcher(t.api().delete(`/api/road-reports/${posted.body.id}`)).expect(204);
      await removeCargo(cargo.id);
    }
  });

  it("reuses an active trip's route until the truck leaves it", async () => {
    const cargo = await newCargo(t, "P1", "D1", { truckId: truck.id, driverId: driver.id });
    try {
      router.route.mockClear();
      for (let i = 0; i < 3; i++) await asDriver(t.api().get("/api/me/trip")).expect(200);
      await t.app.get(TrafficService).run();
      expect(router.route).toHaveBeenCalledTimes(1);

      // ~11 km off the planned route: the next poll plans a new one from the truck.
      await moveTruck(t, "TRIP-1", [40.1, 0]).expect(202);
      const after = await asDriver(t.api().get("/api/me/trip")).expect(200);
      expect(router.route).toHaveBeenCalledTimes(2);
      expect(after.body.trip.route.geometry.coordinates[0]).toEqual([40.1, 0]);
    } finally {
      await moveTruck(t, "TRIP-1", [40, 0]).expect(202);
      await removeCargo(cargo.id);
    }
  });
});
