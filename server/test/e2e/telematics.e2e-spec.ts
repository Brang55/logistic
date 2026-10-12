import { io } from "socket.io-client";
import { LngLat } from "../../src/routing/routing.types";
import { SimulatedTelematicsProvider } from "../../src/telematics/simulated-telematics.provider";
import { PositionFix } from "../../src/telematics/telematics.types";
import { connectLive, newCargo, newTruck, webhook } from "../support/actors";
import { createTestApp, TestApp } from "../support/app";
import { PLACES, router } from "../support/fakes";

describe("telematics (e2e)", () => {
  let t: TestApp;
  let truckA: { id: string };
  let truckB: { id: string };

  beforeAll(async () => {
    t = await createTestApp();
    truckA = await newTruck(t, { truckNumber: "GPS-A" });
    truckB = await newTruck(t, { truckNumber: "GPS-B", telematicsId: "samsara-42" });
  });
  afterAll(() => t.close());

  it("rejects webhooks without the shared secret", async () => {
    const positions = [{ vehicleId: "GPS-A", lng: 1, lat: 1 }];
    await t.api().post("/api/telematics/webhook").send({ positions }).expect(401);
    await webhook(t, positions, "wrong").expect(401);
    await webhook(t, [{ vehicleId: "GPS-A", lng: 1, lat: 100 }]).expect(400);
  });

  it("stores fixes matched by truck number or telematics id and reports unknown vehicles", async () => {
    const res = await webhook(t, [
      { vehicleId: "GPS-A", lng: -95, lat: 35, speedKmh: 80, heading: 90, recordedAt: "2026-01-01T10:00:00Z" },
      { vehicleId: "GPS-A", lng: -95.1, lat: 35, speedKmh: 82, recordedAt: "2026-01-01T10:01:00Z" },
      { vehicleId: "samsara-42", lng: -100, lat: 40 },
      { vehicleId: "nobody", lng: 0, lat: 0 },
    ]).expect(202);
    expect(res.body).toEqual({ accepted: 3, unknownVehicles: ["nobody"] });

    const latest = await t.asDispatcher(t.api().get("/api/positions/latest")).expect(200);
    const byTruck = new Map(latest.body.map((p: { truckId: string }) => [p.truckId, p]));
    expect(byTruck.get(truckA.id)).toMatchObject({ point: [-95.1, 35], speedKmh: 82, recordedAt: "2026-01-01T10:01:00.000Z" });
    expect(byTruck.get(truckB.id)).toMatchObject({ point: [-100, 40] });
  });

  it("returns a truck's track in chronological order", async () => {
    const track = (limit: number) =>
      t.asDispatcher(t.api().get(`/api/trucks/${truckA.id}/positions?since=2025-12-31T00:00:00Z&limit=${limit}`));
    const res = await track(10).expect(200);
    expect(res.body.map((p: { point: LngLat }) => p.point)).toEqual([
      [-95, 35],
      [-95.1, 35],
    ]);
    const newest = await track(1);
    expect(newest.body.map((p: { point: LngLat }) => p.point)).toEqual([[-95.1, 35]]);
  });

  it("refuses live connections without a valid token", async () => {
    const socket = io(t.liveUrl(), { auth: { token: "nope" }, transports: ["websocket"] });
    const error = await new Promise<Error>((resolve) => socket.on("connect_error", resolve));
    socket.close();
    expect(error.message).toBe("unauthorized");
  });

  it("streams new positions to dispatchers", async () => {
    const socket = await connectLive(t, t.tokens.dispatcher);
    try {
      const received = new Promise((resolve) => socket.on("position", resolve));
      await webhook(t, [{ vehicleId: "GPS-B", lng: 21, lat: 41, speedKmh: 70 }]).expect(202);
      expect(await received).toMatchObject({ truckId: truckB.id, point: [21, 41], speedKmh: 70 });
    } finally {
      socket.close();
    }
  });

  it("simulates assigned trucks from their last position", async () => {
    await newCargo(t, "Dallas", "Chicago", { truckId: truckA.id });
    const simulator = t.app.get(SimulatedTelematicsProvider);
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
