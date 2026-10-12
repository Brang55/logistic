import { connectLive, moveTruck, newCargo, newDriverWithLogin, newTruck } from "../support/actors";
import { createTestApp, TestApp } from "../support/app";

describe("driver community (e2e)", () => {
  let t: TestApp;
  let truck: { id: string };
  let rita: { driver: { id: string }; token: string };
  let otto: { driver: { id: string }; token: string };

  const newRoadDriver = (firstName: string, email: string, extra: object = {}) =>
    newDriverWithLogin(t, { firstName, lastName: "Road", email, phoneNumber: "+359 888 000 111", ...extra });
  const report = (token: string, body: object) => t.as(token)(t.api().post("/api/road-reports")).send(body);
  const reports = (token: string) => t.as(token)(t.api().get("/api/road-reports")).expect(200);
  const say = (token: string, body: string) => t.as(token)(t.api().post("/api/community/messages")).send({ body });
  const history = async (token: string) => (await t.as(token)(t.api().get("/api/me/history")).expect(200)).body;

  beforeAll(async () => {
    t = await createTestApp();
    truck = await newTruck(t, { truckNumber: "COMM-1" });
    await moveTruck(t, "COMM-1", [30, 10]).expect(202);
    // Rita has no load; her report is placed at the truck on her profile.
    rita = await newRoadDriver("Rita", "rita@test.local", { truckNumber: "COMM-1" });
    otto = await newRoadDriver("Otto", "otto@test.local");
  });
  afterAll(() => t.close());

  it("pins one-tap reports at the truck's position and shares them with everyone", async () => {
    const created = await report(rita.token, { type: "police" }).expect(201);
    expect(created.body).toMatchObject({
      type: "police",
      label: "Police",
      point: [30, 10],
      reporter: { driverId: rita.driver.id, truckNumber: "COMM-1" },
    });
    const hours = (new Date(created.body.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(1.9);
    expect(hours).toBeLessThanOrEqual(2);

    // Tapping again on the spot refreshes the same report instead of adding another.
    const again = await report(rita.token, { type: "police" }).expect(201);
    expect(again.body.id).toBe(created.body.id);

    const seenByOtto = await reports(otto.token);
    expect(seenByOtto.body.reports.filter((r: { id: string }) => r.id === created.body.id)).toHaveLength(1);
    expect(seenByOtto.body.position).toBeNull();
    expect((await reports(rita.token)).body.position).toEqual([30, 10]);
    await reports(t.tokens.dispatcher);

    const remove = (token: string) => t.as(token)(t.api().delete(`/api/road-reports/${created.body.id}`));
    await remove(otto.token).expect(403);
    await remove(rita.token).expect(204);
    const after = await reports(otto.token);
    expect(after.body.reports.some((r: { id: string }) => r.id === created.body.id)).toBe(false);
  });

  it("rejects reports it can't place and unknown report types", async () => {
    await report(otto.token, { type: "police" }).expect(422);
    await report(rita.token, { type: "aliens" }).expect(400);
    await report(t.tokens.dispatcher, { type: "police" }).expect(403);
  });

  it("pushes new reports and chat messages to drivers live", async () => {
    const socket = await connectLive(t, otto.token);
    try {
      const pushedReport = new Promise((resolve) => socket.on("road-report", resolve));
      const pushedMessage = new Promise((resolve) => socket.on("chat-message", resolve));
      await report(rita.token, { type: "roadworks", note: "Right lane closed" }).expect(201);
      await say(rita.token, "Anyone near COMM-1?").expect(201);
      expect(await pushedReport).toMatchObject({ type: "roadworks", note: "Right lane closed" });
      expect(await pushedMessage).toMatchObject({ body: "Anyone near COMM-1?", sender: { name: "Rita Road" } });
    } finally {
      socket.close();
    }
  });

  it("lets drivers chat and call each other", async () => {
    await say(otto.token, "  Coffee at the border?  ").expect(201);
    await say(otto.token, "   ").expect(400);
    const messages = (await t.as(rita.token)(t.api().get("/api/community/messages")).expect(200)).body;
    expect(messages[messages.length - 1]).toMatchObject({
      body: "Coffee at the border?",
      sender: { driverId: otto.driver.id, name: "Otto Road", phoneNumber: "+359 888 000 111" },
    });

    const directory = (await t.as(rita.token)(t.api().get("/api/community/drivers")).expect(200)).body;
    expect(directory).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: otto.driver.id, phoneNumber: "+359 888 000 111", usesApp: true })]),
    );
    await t.asDispatcher(t.api().get("/api/community/messages")).expect(403);
  });

  it("lists a driver's completed deliveries", async () => {
    const cargo = await newCargo(t, "P1", "D1", { truckId: truck.id, driverId: rita.driver.id });
    const asRita = t.as(rita.token);
    expect((await history(rita.token)).total).toBe(0);
    await asRita(t.api().post(`/api/me/trip/${cargo.id}/picked-up`)).expect(200);
    await asRita(t.api().post(`/api/me/trip/${cargo.id}/delivered`)).expect(200);

    const done = await history(rita.token);
    expect(done.total).toBe(1);
    expect(done.deliveries[0]).toMatchObject({ id: cargo.id, pickupLocation: "P1", deliveryLocation: "D1", truckNumber: "COMM-1" });
    expect((await history(otto.token)).total).toBe(0);
  });
});
