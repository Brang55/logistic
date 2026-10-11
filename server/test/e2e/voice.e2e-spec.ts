import { alertsFor, newCargo, newDriverWithLogin, newTruck } from "../support/actors";
import { createTestApp, TestApp } from "../support/app";

describe("voice commands (e2e)", () => {
  let t: TestApp;
  let cargo: { id: string };
  let asDriver: TestApp["asDispatcher"];

  const interpret = (transcript: string) => asDriver(t.api().post("/api/me/voice/interpret")).send({ transcript }).expect(200);
  const execute = (body: object) => asDriver(t.api().post("/api/me/voice/execute")).send(body);
  const loadCargo = async (id: string) => (await t.asDispatcher(t.api().get(`/api/cargos/${id}`))).body;

  beforeAll(async () => {
    t = await createTestApp();
    const truck = await newTruck(t, { truckNumber: "VOICE-1" });
    const vic = await newDriverWithLogin(t, { firstName: "Vic", lastName: "Voice", email: "vic@test.local" });
    asDriver = t.as(vic.token);
    cargo = await newCargo(t, "Dallas", "Chicago", { truckId: truck.id, driverId: vic.driver.id });
  });
  afterAll(() => t.close());

  it("proposes a delay report and only reports it once confirmed", async () => {
    const proposal = await interpret("I'm 30 minutes late because of heavy rain");
    expect(proposal.body).toMatchObject({
      parser: "rules",
      needsConfirmation: true,
      cargoId: cargo.id,
      intent: { action: "report_delay", delayMinutes: 30, reason: "heavy rain" },
    });
    expect(proposal.body.reply).toContain("30 minute delay");
    expect((await loadCargo(cargo.id)).delayMinutes).toBeNull();

    await execute({ action: "report_delay", cargoId: cargo.id, delayMinutes: 30, reason: "heavy rain" }).expect(200);
    expect(await loadCargo(cargo.id)).toMatchObject({ delayMinutes: 30, delayReason: "heavy rain" });
  });

  it("asks for the minutes when a delay has no amount", async () => {
    const proposal = await interpret("I will have a delayed pickup");
    expect(proposal.body.intent).toMatchObject({ action: "report_delay", delayMinutes: null });
    expect(proposal.body.reply).toMatch(/How many minutes/);
    await execute({ action: "report_delay", cargoId: cargo.id }).expect(400);
  });

  it("changes the delivery address, re-geocodes it and tells dispatch", async () => {
    const proposal = await interpret("set the delivery destination to Walmart DC Temple");
    expect(proposal.body.intent).toMatchObject({ action: "set_delivery_location", location: "Walmart DC Temple" });

    await execute({ action: "set_delivery_location", cargoId: cargo.id, location: "Walmart DC Temple" }).expect(200);
    expect(await loadCargo(cargo.id)).toMatchObject({
      deliveryLocation: "Walmart DC Temple",
      deliveryPoint: { x: -97.34, y: 31.1 },
    });
    expect(await alertsFor(t, cargo.id, "address-changed")).toHaveLength(1);
  });

  it("answers next-stop questions without changing anything", async () => {
    const answer = await interpret("what's my next stop");
    expect(answer.body).toMatchObject({ needsConfirmation: false, intent: { action: "next_stop" } });
    expect(answer.body.reply).toContain("Pickup in Dallas");
  });

  it("refuses to act on a load that isn't the driver's current one", async () => {
    const other = await newCargo(t, "Dallas", "Chicago");
    await execute({ action: "confirm_pickup", cargoId: other.id }).expect(400);
    await t.asDispatcher(t.api().post("/api/me/voice/interpret")).send({ transcript: "delivered" }).expect(403);
  });
});
