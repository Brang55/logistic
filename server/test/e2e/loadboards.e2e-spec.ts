import { createTestApp, TestApp } from "../support/app";

describe("load boards (e2e)", () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.close());

  const loads = async (query: string) => (await t.asDispatcher(t.api().get(`/api/loadboards/loads${query}`)).expect(200)).body;
  const importLoad = (board: string, id: string) => t.asDispatcher(t.api().post(`/api/loadboards/${board}/loads/${id}/import`));

  it("lists loads per region and equipment", async () => {
    const us = await loads("?region=US");
    expect(us.length).toBeGreaterThan(5);
    expect(us.every((load: { region: string; rate: { currency: string } }) => load.region === "US" && load.rate.currency === "USD")).toBe(true);
    // The demo is US-only for now.
    expect(await loads("?region=EU")).toEqual([]);

    const reefers = await loads("?equipment=Reefer");
    expect(reefers.length).toBeGreaterThan(0);
    expect(reefers.every((load: { equipment: string }) => load.equipment === "Reefer")).toBe(true);
    await t.api().get("/api/loadboards/loads").expect(401);
  });

  it("imports a load once, with coordinates, and flags it as imported", async () => {
    const [load] = await loads("?region=US");
    const first = await importLoad(load.board, load.id).expect(200);
    expect(first.body).toMatchObject({
      created: true,
      cargo: {
        source: load.board,
        externalId: load.id,
        pickupLocation: load.origin.address,
        deliveryLocation: load.destination.address,
        pickupPoint: { x: load.origin.point[0], y: load.origin.point[1] },
        status: "new",
      },
    });
    const again = await importLoad(load.board, load.id).expect(200);
    expect(again.body).toMatchObject({ created: false, cargo: { id: first.body.cargo.id } });

    const listed = (await loads("?region=US")).find((l: { id: string }) => l.id === load.id);
    expect(listed.cargoId).toBe(first.body.cargo.id);
    await importLoad(load.board, "nope").expect(404);
  });

  it("auto-imports the loads our company booked, once", async () => {
    const sync = async () => (await t.asDispatcher(t.api().post("/api/loadboards/sync")).expect(200)).body;
    expect((await sync()).imported.length).toBeGreaterThan(0);
    expect((await sync()).imported).toEqual([]);
    const alerts = (await t.asDispatcher(t.api().get("/api/traffic/alerts"))).body;
    expect(alerts.find((a: { kind: string }) => a.kind === "loads-imported")).toBeDefined();
  });
});
