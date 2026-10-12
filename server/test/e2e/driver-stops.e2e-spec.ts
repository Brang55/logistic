import { SimulatedTelematicsProvider } from "../../src/telematics/simulated-telematics.provider";
import { PositionFix } from "../../src/telematics/telematics.types";
import { moveTruck, newCargo, newDriverWithLogin, newTruck } from "../support/actors";
import { createTestApp, TestApp } from "../support/app";
import { PLACES, router } from "../support/fakes";

describe("driver-confirmed stops (e2e)", () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.close());

  it("drives app drivers to the next stop and waits for them to confirm", async () => {
    const truck = await newTruck(t, { truckNumber: "APP-1" });
    const ann = await newDriverWithLogin(t, { firstName: "Ann", lastName: "App", email: "ann@test.local" });
    const asDriver = t.as(ann.token);
    await moveTruck(t, "APP-1", [40, 0]).expect(202);
    const cargo = await newCargo(t, "P1", "D1", { truckId: truck.id, driverId: ann.driver.id });

    const simulator = t.app.get(SimulatedTelematicsProvider);
    const fixes: PositionFix[] = [];
    const sink = async (batch: PositionFix[]) => fixes.push(...batch);
    const cargoStatus = async () => (await t.asDispatcher(t.api().get(`/api/cargos/${cargo.id}`))).body.status;
    const lastFix = () => fixes.filter((f) => f.truckId === truck.id).pop()!;

    // Drives only to the pickup and stops there; nothing is confirmed for the driver.
    await simulator.plan();
    expect(router.route).toHaveBeenLastCalledWith(expect.objectContaining({ coordinates: [[40, 0], PLACES.P1] }));
    await simulator.tick(sink);
    await simulator.tick(sink);
    expect(lastFix()).toMatchObject({ point: PLACES.P1, speedKmh: 0 });
    expect(await cargoStatus()).toBe("new");

    // The driver confirms; the next plan heads for the delivery and waits there too.
    await asDriver(t.api().post(`/api/me/trip/${cargo.id}/picked-up`)).expect(200);
    await moveTruck(t, "APP-1", PLACES.P1);
    await simulator.plan();
    expect(router.route).toHaveBeenLastCalledWith(expect.objectContaining({ coordinates: [PLACES.P1, PLACES.D1] }));
    await simulator.tick(sink);
    await simulator.tick(sink);
    expect(lastFix()).toMatchObject({ point: PLACES.D1, speedKmh: 0 });
    expect(await cargoStatus()).toBe("picked_up");

    await asDriver(t.api().post(`/api/me/trip/${cargo.id}/delivered`)).expect(200);
    expect(await cargoStatus()).toBe("delivered");
  });
});
