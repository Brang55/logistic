import { newTruck } from "../support/actors";
import { createTestApp, TestApp } from "../support/app";

describe("fleet and cargo (e2e)", () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.close());

  it("creates trucks with dimensions and rejects duplicates", async () => {
    const truck = await newTruck(t, { truckNumber: "T-1", truckModel: "Volvo FH", heightM: 4, weightT: 40 });
    expect(truck).toMatchObject({ truckNumber: "T-1", status: "available", heightM: 4 });

    await t.asDispatcher(t.api().post("/api/trucks")).send({ truckNumber: "T-1" }).expect(409);
    await t.asDispatcher(t.api().post("/api/trucks")).send({ truckNumber: "T-2", heightM: 12 }).expect(400);
  });

  it("lets drivers read but not modify the fleet", async () => {
    const asDriver = t.as(t.tokens.driver);
    await asDriver(t.api().get("/api/trucks")).expect(200);
    await asDriver(t.api().post("/api/trucks")).send({ truckNumber: "T-9" }).expect(403);
  });

  it("returns 404 for unknown ids and 400 for malformed ones", async () => {
    await t.asDispatcher(t.api().get("/api/trucks/00000000-0000-0000-0000-000000000000")).expect(404);
    await t.asDispatcher(t.api().get("/api/trucks/undefined")).expect(400);
  });

  it("reports whether a driver email is registered", async () => {
    await t
      .asDispatcher(t.api().post("/api/drivers"))
      .send({ firstName: "A", lastName: "B", truckDriverEmail: "ab@test.local", phoneNumber: 359888 })
      .expect(201);
    const taken = await t.asDispatcher(t.api().get("/api/drivers/email-exists?email=ab@test.local")).expect(200);
    const free = await t.asDispatcher(t.api().get("/api/drivers/email-exists?email=zz@test.local")).expect(200);
    expect([taken.body.exists, free.body.exists]).toEqual([true, false]);
  });

  it("marks assigned resources taken and frees them on reassignment and delete", async () => {
    const truck = await newTruck(t, { truckNumber: "T-A" });
    const other = await newTruck(t, { truckNumber: "T-B" });
    const status = async (id: string) => (await t.asDispatcher(t.api().get(`/api/trucks/${id}`))).body.status;

    const cargo = (
      await t
        .asDispatcher(t.api().post("/api/cargos"))
        .send({ shipperName: "S", weight: 1200, truckId: truck.id, driverId: "" })
        .expect(201)
    ).body;
    expect(cargo).toMatchObject({ status: "new", weight: "1200", truckId: truck.id, driverId: null });
    expect(await status(truck.id)).toBe("taken");

    const edited = await t.asDispatcher(t.api().patch(`/api/cargos/${cargo.id}`)).send({ truckId: other.id }).expect(200);
    expect(edited.body.status).toBe("edited");
    expect([await status(truck.id), await status(other.id)]).toEqual(["available", "taken"]);

    await t.asDispatcher(t.api().post(`/api/cargos/${cargo.id}/confirm`)).expect(200);
    const confirmed = await t.asDispatcher(t.api().get("/api/cargos?status=confirmed")).expect(200);
    expect(confirmed.body.map((c: { id: string }) => c.id)).toContain(cargo.id);

    await t.asDispatcher(t.api().delete(`/api/cargos/${cargo.id}`)).expect(204);
    expect(await status(other.id)).toBe("available");
  });

  it("filters by status", async () => {
    const available = await t.asDispatcher(t.api().get("/api/trucks?status=available")).expect(200);
    expect(available.body.length).toBeGreaterThan(0);
    expect(available.body.every((truck: { status: string }) => truck.status === "available")).toBe(true);
  });
});
