import { CargosService } from "../../src/cargos/cargos.service";
import { newCargo, newCrewedTruck, newDriver, newDriverWithLogin, newTruck } from "../support/actors";
import { createTestApp, TestApp } from "../support/app";
import { PLACES } from "../support/fakes";

describe("truck crews: a truck brings its driver and trailer (e2e)", () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.close());

  const get = async (path: string) => (await t.asDispatcher(t.api().get(`/api/${path}`)).expect(200)).body;
  const assign = (cargoId: string, body: object) => t.asDispatcher(t.api().post(`/api/cargos/${cargoId}/assign`)).send(body);
  const newTrailer = async (trailerNumber: string) =>
    (await t.asDispatcher(t.api().post("/api/trailers")).send({ trailerNumber }).expect(201)).body;
  const hook = (truckId: string, trailerId: string) =>
    t.asDispatcher(t.api().patch(`/api/trucks/${truckId}`)).send({ trailerId }).expect(200);
  const reseat = (driverId: string, truckId: string | null) =>
    t.asDispatcher(t.api().patch(`/api/drivers/${driverId}`)).send({ truckId }).expect(200);

  it("assigns a truck's seated driver and hooked trailer, and the driver sees the load", async () => {
    const truck = await newTruck(t, { truckNumber: "CREW-1" });
    const trailer = await newTrailer("CT-1");
    await hook(truck.id, trailer.id);
    const { driver, token } = await newDriverWithLogin(t, {
      firstName: "Cora",
      lastName: "Crew",
      email: "cora@test.local",
      truckId: truck.id,
    });
    expect(driver).toMatchObject({ truckId: truck.id, truckNumber: "CREW-1" });

    const cargo = await newCargo(t, "Dallas", "Chicago");
    const assigned = await assign(cargo.id, { truckId: truck.id }).expect(200);
    expect(assigned.body).toMatchObject({ truckId: truck.id, driverId: driver.id, trailerId: trailer.id });
    expect(await get(`drivers/${driver.id}`)).toMatchObject({ status: "taken", truckId: truck.id });

    const mine = await t.as(token)(t.api().get("/api/me/trip")).expect(200);
    expect(mine.body.trip).toMatchObject({ cargo: { id: cargo.id }, trailer: { trailerNumber: "CT-1" } });

    // A trailer picked for the load wins over the hooked one, without re-hooking the truck.
    const other = await newTrailer("CT-2");
    await assign(cargo.id, { truckId: truck.id, trailerId: other.id }).expect(200);
    expect((await get(`cargos/${cargo.id}`)).trailerId).toBe(other.id);
    expect((await get(`trucks/${truck.id}`)).trailerId).toBe(trailer.id);
  });

  it("refuses a truck without a driver unless the load gets a relief driver", async () => {
    const empty = await newTruck(t, { truckNumber: "CREW-EMPTY" });
    const relief = await newDriver(t, { firstName: "Relief" });
    const cargo = await newCargo(t, "Dallas", "Memphis");

    const refused = await assign(cargo.id, { truckId: empty.id }).expect(409);
    expect(refused.body).toMatchObject({ code: "TRUCK_HAS_NO_DRIVER" });
    expect(refused.body.message).toContain("CREW-EMPTY has no driver");
    expect((await get(`cargos/${cargo.id}`)).truckId).toBeNull();

    const driven = await assign(cargo.id, { truckId: empty.id, driverId: relief.id }).expect(200);
    expect(driven.body).toMatchObject({ truckId: empty.id, driverId: relief.id });

    // Editing anything else keeps the relief driver; taking the truck off takes the driver too.
    await t.asDispatcher(t.api().patch(`/api/cargos/${cargo.id}`)).send({ notes: "Gate 4", truckId: empty.id, driverId: relief.id }).expect(200);
    const unassigned = await assign(cargo.id, { truckId: "" }).expect(200);
    expect(unassigned.body).toMatchObject({ truckId: null, driverId: null });

    await t.asDispatcher(t.api().post("/api/cargos")).send({ pickupLocation: "Dallas", driverId: relief.id }).expect(400);
  });

  it("moves unfinished loads with the truck when its driver changes", async () => {
    const truck = await newCrewedTruck(t, { truckNumber: "CREW-2" });
    const other = await newCrewedTruck(t, { truckNumber: "CREW-3" });
    const relief = await newDriver(t, { firstName: "Rhea" });
    const [before, planned, relieved, onOther] = await Promise.all([
      newCargo(t, "Dallas", "Chicago", { truckId: truck.id }),
      newCargo(t, "Dallas", "Memphis", { truckId: truck.id }),
      newCargo(t, "Memphis", "Chicago", { truckId: truck.id, driverId: relief.id }),
      newCargo(t, "Chicago", "Dallas", { truckId: other.id }),
    ]);
    const cargos = t.app.get(CargosService);
    await cargos.markPickedUp(before.id);
    await cargos.markDelivered(before.id);

    // CREW-3's driver takes over CREW-2.
    const moved = await reseat(other.driverId, truck.id);
    expect(moved.body).toMatchObject({ truckId: truck.id, truckNumber: "CREW-2" });

    const driverOf = async (id: string) => (await get(`cargos/${id}`)).driverId;
    expect(await driverOf(planned.id)).toBe(other.driverId);
    expect(await driverOf(relieved.id)).toBe(relief.id);
    // History keeps who actually drove the delivered load.
    expect(await driverOf(before.id)).toBe(truck.driverId);
    // The truck they left has no driver now, and neither does its load.
    expect(await driverOf(onOther.id)).toBeNull();
    expect((await get(`trucks/${other.id}`)).driverId).toBeNull();
    expect(await get(`drivers/${truck.driverId}`)).toMatchObject({ truckId: null, status: "available" });
    expect(await get(`drivers/${other.driverId}`)).toMatchObject({ status: "taken" });

    // Taking them out of the truck leaves its loads without a driver.
    await reseat(other.driverId, "");
    expect(await driverOf(planned.id)).toBeNull();
    expect(await get(`drivers/${other.driverId}`)).toMatchObject({ truckId: null, status: "available" });
  });

  it("hooks a trailer to one truck at a time", async () => {
    const first = await newTruck(t, { truckNumber: "CREW-4" });
    const second = await newTruck(t, { truckNumber: "CREW-5" });
    const trailer = await newTrailer("CT-3");
    await hook(first.id, trailer.id);
    await hook(second.id, trailer.id);
    expect((await get(`trucks/${first.id}`)).trailerId).toBeNull();
    expect((await get(`trucks/${second.id}`)).trailerId).toBe(trailer.id);
  });

  it("tells dispatch where busy trucks will be free", async () => {
    const truck = await newCrewedTruck(t, { truckNumber: "CREW-6" });
    const current = await newCargo(t, "Dallas", "Chicago", { truckId: truck.id });
    const next = await newCargo(t, "Chicago", "Memphis");

    const origins = await get(`cargos/${next.id}/truck-origins`);
    expect(origins.find((o: { truckId: string }) => o.truckId === truck.id)).toEqual({
      truckId: truck.id,
      point: PLACES.Chicago,
      afterCargoId: current.id,
    });
    // A load doesn't count against itself: with no other loads the truck starts where it is.
    const own = await get(`cargos/${current.id}/truck-origins`);
    expect(own.find((o: { truckId: string }) => o.truckId === truck.id)).toBeUndefined();
  });
});
