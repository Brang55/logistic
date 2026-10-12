import { newCargo, newCrewedTruck, newDriver, newTruck } from "../support/actors";
import { createTestApp, TestApp } from "../support/app";
import { geocoder, PLACES, router } from "../support/fakes";

describe("routing (e2e)", () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  it("geocodes cargo locations on create and only re-geocodes changed text", async () => {
    const cargo = await newCargo(t, "Dallas", "Chicago");
    expect(cargo.pickupPoint).toEqual({ x: -96.8, y: 32.78 });
    expect(cargo.deliveryPoint).toEqual({ x: -87.63, y: 41.88 });

    geocoder.geocode.mockClear();
    const edited = await t
      .asDispatcher(t.api().patch(`/api/cargos/${cargo.id}`))
      .send({ pickupLocation: "Dallas", deliveryLocation: "Memphis" })
      .expect(200);
    expect(geocoder.geocode.mock.calls).toEqual([["Memphis"]]);
    expect(edited.body.deliveryPoint).toEqual({ x: -90.05, y: 35.15 });
  });

  it("routes a cargo with the assigned truck's dimensions", async () => {
    const truck = await newCrewedTruck(t, { truckNumber: "R-1", heightM: "4.2", weightT: "40" });
    const cargo = await newCargo(t, "Dallas", "Chicago");
    await t.asDispatcher(t.api().post(`/api/cargos/${cargo.id}/confirm`)).expect(200);

    const assigned = await t
      .asDispatcher(t.api().post(`/api/cargos/${cargo.id}/assign`))
      .send({ truckId: truck.id })
      .expect(200);
    expect(assigned.body).toMatchObject({ truckId: truck.id, status: "confirmed" });

    const res = await t.asDispatcher(t.api().get(`/api/cargos/${cargo.id}/route?from=-90.05,35.15`)).expect(200);
    expect(res.body).toMatchObject({ pickup: PLACES.Dallas, delivery: PLACES.Chicago, truck: { id: truck.id } });
    expect(router.route).toHaveBeenCalledWith({
      coordinates: [PLACES.Memphis, PLACES.Dallas, PLACES.Chicago],
      vehicle: expect.objectContaining({ heightM: 4.2, weightT: 40 }),
    });
  });

  it("asks the dispatcher to accept truck restrictions before assigning", async () => {
    const heavy = await newCrewedTruck(t, { truckNumber: "H-1", weightT: "40" });
    const other = await newCrewedTruck(t, { truckNumber: "H-2", weightT: "26" });
    const van = await newCrewedTruck(t, { truckNumber: "V-1", weightT: "3.5" });
    const relief = await newDriver(t, { firstName: "Relief" });
    const cargo = await newCargo(t, "Dallas", "Old Town");
    const assign = (body: object) => t.asDispatcher(t.api().post(`/api/cargos/${cargo.id}/assign`)).send(body);

    const refused = await assign({ truckId: heavy.id }).expect(409);
    expect(refused.body).toMatchObject({ code: "ROUTE_RESTRICTIONS", violations: ["Vehicle is too heavy for this road"] });
    expect((await t.asDispatcher(t.api().get(`/api/cargos/${cargo.id}`))).body.truckId).toBeNull();

    const accepted = await assign({ truckId: heavy.id, acceptRestrictions: true }).expect(200);
    expect(accepted.body).toMatchObject({
      truckId: heavy.id,
      restrictionsAcceptedBy: "dispatcher@test.local",
      restrictionsAcceptedTruckId: heavy.id,
    });
    // Changing only the driver keeps the acceptance for the same truck.
    const reliefDriven = await assign({ driverId: relief.id }).expect(200);
    expect(reliefDriven.body).toMatchObject({ driverId: relief.id, restrictionsAcceptedTruckId: heavy.id });

    await assign({ truckId: other.id }).expect(409);
    const light = await assign({ truckId: van.id }).expect(200);
    expect(light.body).toMatchObject({ truckId: van.id, restrictionsAcceptedAt: null, restrictionsAcceptedTruckId: null });
  });

  it("explains when a cargo location cannot be found", async () => {
    const cargo = await newCargo(t, "Atlantis", "Chicago");
    const res = await t.asDispatcher(t.api().get(`/api/cargos/${cargo.id}/route`)).expect(422);
    expect(res.body.message).toContain("Atlantis");
  });

  it("validates ad-hoc route requests", async () => {
    const route = (coordinates: number[][]) => t.asDispatcher(t.api().post("/api/routing/route")).send({ coordinates });
    await route([[0, 0]]).expect(400);
    await route([[0, 0], [200, 0]]).expect(400);
    await route([[0, 0], [1, 1]]).expect(200);
  });

  it("stores empty truck dimensions as null", async () => {
    const truck = await newTruck(t, { truckNumber: "R-2", heightM: "" });
    expect(truck.heightM).toBeNull();
  });
});
