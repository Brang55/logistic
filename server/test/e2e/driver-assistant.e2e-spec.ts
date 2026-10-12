import Anthropic from "@anthropic-ai/sdk";
import { alertsFor, moveTruck, newCargo, newDriverWithLogin, newTruck } from "../support/actors";
import { createTestApp, TestApp } from "../support/app";
import { callTool, lastToolResults, lastUserText, say, ScriptedModel } from "../support/assistant";
import { PLACES } from "../support/fakes";

/** A driver with a login, on a truck, with one load Dallas → Chicago. */
async function driverOnLoad(t: TestApp, name: string) {
  const truck = await newTruck(t, { truckNumber: `${name.toUpperCase()}-1` });
  const firstName = name[0].toUpperCase() + name.slice(1);
  const { driver, token } = await newDriverWithLogin(t, { firstName, lastName: "Driver", email: `${name}@test.local`, truckId: truck.id });
  const cargo = await newCargo(t, "Dallas", "Chicago", { truckId: truck.id });
  return { truck, driver, cargo, as: t.as(token) };
}

describe("driver assistant without Claude (keyword fallback, e2e)", () => {
  let t: TestApp;
  let me: Awaited<ReturnType<typeof driverOnLoad>>;

  const say_ = (text: string) => me.as(t.api().post("/api/assistant/message")).send({ text }).expect(200);
  const confirm = (id: string) => me.as(t.api().post(`/api/assistant/actions/${id}/confirm`)).send({});
  const loadCargo = async (id: string) => (await t.asDispatcher(t.api().get(`/api/cargos/${id}`))).body;

  beforeAll(async () => {
    t = await createTestApp();
    me = await driverOnLoad(t, "vic");
  });
  afterAll(() => t.close());

  it("works for drivers on keywords, and is off for staff", async () => {
    expect((await me.as(t.api().get("/api/assistant"))).body).toEqual({ enabled: true, model: "keywords" });
    await t.asDispatcher(t.api().post("/api/assistant/message")).send({ text: "hi" }).expect(503);
  });

  it("proposes a delay report and only reports it once confirmed", async () => {
    const { body } = await say_("I'm 30 minutes late because of heavy rain");
    expect(body.reply).toBe("Report a 30 minute delay for the pickup in Dallas?");
    expect(body.actions[0]).toMatchObject({ tool: "report_delay", details: ["Reason: heavy rain"] });
    expect((await loadCargo(me.cargo.id)).delayMinutes).toBeNull();

    await confirm(body.actions[0].id).expect(200);
    expect(await loadCargo(me.cargo.id)).toMatchObject({ delayMinutes: 30, delayReason: "heavy rain" });
  });

  it("asks for the minutes when a delay has no amount", async () => {
    const { body } = await say_("I will have a delayed pickup");
    expect(body).toMatchObject({ reply: "How many minutes late will you be?", actions: [] });
  });

  it("changes the delivery address, re-geocodes it and tells dispatch", async () => {
    const { body } = await say_("set the delivery destination to Walmart DC Temple");
    expect(body.actions[0]).toMatchObject({ summary: "Change the delivery address to Walmart DC Temple", details: ["Now: Chicago"] });

    await confirm(body.actions[0].id).expect(200);
    expect(await loadCargo(me.cargo.id)).toMatchObject({
      deliveryLocation: "Walmart DC Temple",
      deliveryPoint: { x: -97.34, y: 31.1 },
    });
    expect(await alertsFor(t, me.cargo.id, "address-changed")).toHaveLength(1);
  });

  it("answers next-stop questions in miles without changing anything", async () => {
    await moveTruck(t, me.truck.truckNumber, PLACES.Memphis);
    const { body } = await say_("what's my next stop");
    expect(body.actions).toEqual([]);
    expect(body.reply).toMatch(/^Pickup in Dallas\. \d+ miles, about /);
  });

  it("pins road reports where the truck is", async () => {
    const { body } = await say_("police ahead");
    expect(body.actions[0]).toMatchObject({ tool: "report_road_issue", summary: 'Report "Police" where your truck is now' });
    await confirm(body.actions[0].id).expect(200);

    const reports = (await me.as(t.api().get("/api/road-reports"))).body.reports;
    expect(reports).toEqual([expect.objectContaining({ type: "police", point: PLACES.Memphis })]);
  });

  it("refuses to act on a load that is no longer the driver's", async () => {
    const { body } = await say_("picked up the load");
    expect(body.actions[0].summary).toBe("Confirm pickup in Dallas");
    // Dispatch takes the truck, and with it the driver, off the load before they confirm.
    await t.asDispatcher(t.api().post(`/api/cargos/${me.cargo.id}/assign`)).send({ truckId: "" }).expect(200);
    const refused = await confirm(body.actions[0].id).expect(400);
    expect(refused.body.message).toBe("You have no load assigned right now.");
    expect((await loadCargo(me.cargo.id)).pickedUpAt).toBeNull();
  });
});

describe("driver assistant with Claude (e2e)", () => {
  let t: TestApp;
  const model = new ScriptedModel();
  let me: Awaited<ReturnType<typeof driverOnLoad>>;

  const message = (text: string) => me.as(t.api().post("/api/assistant/message")).send({ text }).expect(200);
  const confirm = (id: string) => me.as(t.api().post(`/api/assistant/actions/${id}/confirm`)).send({}).expect(200);

  beforeAll(async () => {
    t = await createTestApp({ assistantModel: model });
    me = await driverOnLoad(t, "ann");
  });
  afterAll(() => t.close());

  it("gets the driver's prompt, tools and current load, and no staff tools", async () => {
    model.script(callTool("my_trip", {}), say("Pickup in Dallas."));
    await message("where am I going");

    const request = model.requests[0];
    expect(request.system).toContain("driver app");
    const tools = (request.tools as Anthropic.Beta.BetaTool[]).map((tool) => tool.name);
    expect(tools).toEqual(expect.arrayContaining(["my_trip", "report_delay", "message_dispatch", "add_logbook_entry"]));
    expect(tools).not.toContain("assign_cargo");
    expect(lastUserText(request)).toMatch(/Current load SH-\w{6} on truck ANN-1: pickup at Dallas \(not picked up yet\), delivery at Chicago\./);
    expect(JSON.parse(lastToolResults(model.requests[1])[0].content)).toMatchObject({
      truck: "ANN-1",
      pickup: { place: "Dallas", done: false },
      nextStop: "pickup in Dallas",
    });
  });

  it("messages dispatch through their alerts", async () => {
    model.script(callTool("message_dispatch", { text: "Dock 4 is closed until 3pm" }), say("Send that to dispatch?"));
    const { body } = await message("tell dispatch dock four is closed until 3pm");
    expect(body.actions[0].summary).toBe('Send to dispatch: "Dock 4 is closed until 3pm"');
    await confirm(body.actions[0].id);
    expect(await alertsFor(t, me.cargo.id, "driver-message")).toEqual([
      expect.objectContaining({ severity: "info", message: "Ann Driver (ANN-1): Dock 4 is closed until 3pm" }),
    ]);
  });

  it("adds logbook entries to the driver's truck in miles", async () => {
    model.script(
      callTool("add_logbook_entry", { title: "Cracked passenger mirror", kind: "damage", odometerMiles: 100000 }),
      say("Add that to the logbook?"),
    );
    const { body } = await message("log a cracked passenger mirror, odometer 100,000");
    expect(body.actions[0]).toMatchObject({
      summary: "Add to truck ANN-1's logbook: Cracked passenger mirror",
      details: ["Type: damage", "Odometer: 100,000 mi"],
    });
    await confirm(body.actions[0].id);
    const log = (await t.asDispatcher(t.api().get(`/api/trucks/${me.truck.id}/log`))).body;
    expect(log[0]).toMatchObject({ kind: "damage", title: "Cracked passenger mirror", odometerKm: 160934, authorEmail: "ann@test.local" });
  });

  it("falls back to keywords when Claude can't be reached", async () => {
    model.script(() => {
      throw new Anthropic.APIError(500, undefined, "overloaded", new Headers());
    });
    const { body } = await message("I'm 15 minutes late");
    expect(body).toMatchObject({ reply: "Report a 15 minute delay for the pickup in Dallas?", actions: [{ tool: "report_delay" }] });
  });
});
