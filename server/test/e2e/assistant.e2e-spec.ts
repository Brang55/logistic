import { CargosService } from "../../src/cargos/cargos.service";
import { newCargo, newCrewedTruck } from "../support/actors";
import { createTestApp, TestApp } from "../support/app";
import { callTool, lastResult, lastToolResults, lastUserText, say, ScriptedModel } from "../support/assistant";

type Found = { loads: { id: string; ref: string }[] };
type FoundTrucks = { trucks: { id: string; truckNumber: string }[] };

describe("dispatcher assistant (e2e)", () => {
  let t: TestApp;
  const model = new ScriptedModel();
  let dallasLoad: { id: string };
  let truck: { id: string };

  const message = (text: string, extra: object = {}) =>
    t.asDispatcher(t.api().post("/api/assistant/message")).send({ text, ...extra }).expect(200);
  const confirm = (id: string, body: object = {}) =>
    t.asDispatcher(t.api().post(`/api/assistant/actions/${id}/confirm`)).send(body);
  const loadCargo = async (id: string) => (await t.asDispatcher(t.api().get(`/api/cargos/${id}`))).body;

  // "Assign truck <number> to the <city> load": look both up, then propose the assignment.
  const assignScript = (city: string, truckNumber: string) => {
    let cargoId = "";
    model.script(
      callTool("find_cargo", { text: city }),
      callTool("find_trucks", (request) => {
        cargoId = lastResult<Found>(request).loads[0].id;
        return { text: truckNumber };
      }),
      callTool("assign_cargo", (request) => ({ cargoId, truckId: lastResult<FoundTrucks>(request).trucks[0].id })),
      say(`Assign truck ${truckNumber} to that load? Please confirm.`),
    );
  };

  beforeAll(async () => {
    t = await createTestApp({ assistantModel: model });
    truck = await newCrewedTruck(t, { truckNumber: "AST-1", weightT: 20 });
    dallasLoad = await newCargo(t, "Dallas", "Chicago", { weight: "18144" });
  });
  afterAll(() => t.close());

  it("reports which model it uses", async () => {
    const status = await t.asDispatcher(t.api().get("/api/assistant")).expect(200);
    expect(status.body).toEqual({ enabled: true, model: "scripted" });
  });

  it("looks things up, proposes an assignment, and only assigns it once confirmed", async () => {
    assignScript("Dallas", "AST-1");
    const res = await message("assign truck AST-1 to the Dallas load", { page: "/dispatcher" });

    expect(res.body.reply).toContain("Please confirm");
    expect(res.body.actions).toHaveLength(1);
    expect(res.body.actions[0]).toMatchObject({ tool: "assign_cargo", title: "Assign load", warnings: [] });
    expect(res.body.actions[0].summary).toMatch(/^Assign truck AST-1 \(driven by AST-1 Driver\) to SH-\w{6} \(Dallas → Chicago\)$/);
    // The model saw today's date, the open page, and imperial units in the lookup.
    expect(lastUserText(model.requests[0])).toContain("Open page: /dispatcher.");
    expect(lastToolResults(model.requests[1])[0].content).toContain('"weightLb":40001');
    expect((await loadCargo(dallasLoad.id)).truckId).toBeNull();

    const done = await confirm(res.body.actions[0].id).expect(200);
    expect(done.body.message).toMatch(/^Assignment saved for SH-/);
    expect(done.body.link).toEqual({ type: "navigate", path: `/cargoList/${dallasLoad.id}/preview`, label: expect.stringMatching(/^SH-\w{6}$/) });
    expect((await loadCargo(dallasLoad.id)).truckId).toBe(truck.id);

    // Done once only.
    await confirm(res.body.actions[0].id).expect(404);

    // The next turn tells the model what the user did.
    model.script(say("You're welcome."));
    await message("thanks", { conversationId: res.body.conversationId });
    expect(lastUserText(model.requests[0])).toContain('The user confirmed "Assign truck AST-1');
    // History is kept and only appended to.
    expect(model.requests[0].messages).toHaveLength(9);
  });

  it("keeps an assignment pending until truck restrictions are accepted", async () => {
    await newCrewedTruck(t, { truckNumber: "HEAVY-1", weightT: 30 });
    await newCargo(t, "Memphis", "Old Town");
    assignScript("Old Town", "HEAVY-1");
    const { body } = await message("put HEAVY-1 on the Old Town load");
    const action = body.actions[0];

    const refused = await confirm(action.id).expect(409);
    expect(refused.body).toMatchObject({ code: "ROUTE_RESTRICTIONS", violations: ["Vehicle is too heavy for this road"] });

    await confirm(action.id, { acceptRestrictions: true }).expect(200);
  });

  it("cancels without changing anything, and keeps actions private to their user", async () => {
    model.script(
      callTool("find_cargo", { text: "Dallas" }),
      callTool("confirm_cargo", (request) => ({ cargoId: lastResult<Found>(request).loads[0].id })),
      say("Confirm the Dallas load?"),
    );
    const { body } = await message("confirm the Dallas load");
    const action = body.actions[0];
    expect(action.summary).toMatch(/^Confirm SH-\w{6} \(Dallas → Chicago\)$/);

    await t.as(t.tokens.admin)(t.api().post(`/api/assistant/actions/${action.id}/confirm`)).send({}).expect(404);
    await t.asDispatcher(t.api().post(`/api/assistant/actions/${action.id}/cancel`)).expect(200);
    await confirm(action.id).expect(404);
    expect((await loadCargo(dallasLoad.id)).status).toBe("new");
  });

  it("creates loads in pounds and opens pages", async () => {
    model.script(
      callTool("create_cargo", { pickupLocation: "Dallas", deliveryLocation: "Memphis", weightLb: 40000, pickupDate: "2026-10-14" }),
      callTool("open_page", { page: "all_cargo" }),
      say("Create a load from Dallas to Memphis?"),
    );
    const { body } = await message("new load Dallas to Memphis, 40k pounds, Wednesday, then show all cargo");
    expect(body.actions[0]).toMatchObject({
      summary: "Create a load Dallas → Memphis",
      details: ["Pickup date: Wed, Oct 14, 2026", "Weight: 40,000 lb"],
    });
    expect(body.ui).toEqual([{ type: "navigate", path: "/cargoList", label: "All cargo" }]);

    const done = await confirm(body.actions[0].id).expect(200);
    const created = await loadCargo(done.body.link.path.split("/")[2]);
    expect(created).toMatchObject({ pickupLocation: "Dallas", deliveryLocation: "Memphis", weight: "18143.7", status: "new" });
  });

  it("withdraws open proposals when the user asks for something else", async () => {
    model.script(
      callTool("find_cargo", { text: "Dallas" }),
      callTool("confirm_cargo", (request) => ({ cargoId: lastResult<Found>(request).loads[0].id })),
      say("Confirm it?"),
    );
    const first = await message("confirm the Dallas load");

    model.script(say("Which truck?"));
    await message("actually, something else", { conversationId: first.body.conversationId });
    expect(lastUserText(model.requests[0])).toContain("it was withdrawn and not done");
    await confirm(first.body.actions[0].id).expect(404);
  });

  it("finds loads by period, actual delivery and delay", async () => {
    const cargos = t.app.get(CargosService);
    const plan = (to: string, deliveryDate: string) =>
      newCargo(t, "Memphis", to, { deliveryDate, truckId: truck.id }) as Promise<{ id: string }>;
    const late = await plan("Chicago", "2026-10-20");
    const early = await plan("Dallas", "2026-10-02");
    await plan("Old Town", "2026-11-03");
    // One load delivered today, after a reported delay.
    await cargos.markPickedUp(early.id);
    await cargos.reportDelay(early.id, 25, "heavy traffic");
    await cargos.markDelivered(early.id);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    type Result = { total: number; truncated: boolean; loads: { id: string; deliveryDate: string; deliveredOn: string | null }[] };
    const find = async (input: Record<string, unknown>) => {
      model.script(callTool("find_cargo", input), say("ok"));
      await message("find");
      return lastToolResults(model.requests[1])[0];
    };

    // Planned deliveries in October, oldest first, including the delivered one.
    const october = JSON.parse((await find({ dateField: "delivery", from: "2026-10-01", to: "2026-10-31" })).content) as Result;
    expect(october.loads.map((l) => l.id)).toEqual([early.id, late.id]);
    expect(october).toMatchObject({ total: 2, truncated: false });

    // Actually delivered today, and delayed loads.
    const delivered = JSON.parse((await find({ dateField: "delivered", from: today, to: today })).content) as Result;
    expect(delivered.loads).toEqual([expect.objectContaining({ id: early.id, deliveredOn: today, delay: { minutes: 25, reason: "heavy traffic" } })]);
    const delayed = JSON.parse((await find({ delayedOnly: true, status: "any" })).content) as Result;
    expect(delayed.loads.map((l) => l.id)).toEqual([early.id]);

    // A period needs to say which date it is about.
    expect(await find({ from: "2026-10-01" })).toMatchObject({ isError: true, content: expect.stringMatching(/dateField/) });
  });

  it("links loads, trucks and pages in replies, but keeps the history plain", async () => {
    const ref = `SH-${dallasLoad.id.slice(0, 6).toUpperCase()}`;
    const plain = `**${ref}** is on AST-1. See [Traffic](/traffic) or [this](/nope).`;
    model.script(say(plain));
    const { body } = await message("where is the Dallas load");
    expect(body.reply).toBe(
      `**[${ref}](/cargoList/${dallasLoad.id}/preview)** is on [AST-1](/trucks/${truck.id}). See [Traffic](/traffic) or this.`,
    );

    model.script(say("ok"));
    await message("thanks", { conversationId: body.conversationId });
    const history = model.requests[0].messages;
    expect(history[history.length - 2]).toMatchObject({ role: "assistant", content: [{ type: "text", text: plain }] });
  });

  it("sends tool errors back to the model instead of failing", async () => {
    model.script(
      callTool("assign_cargo", { cargoId: "00000000-0000-4000-8000-000000000000", truckId: truck.id }),
      callTool("update_cargo", { cargoId: "not-an-id", notes: "x" }),
      say("I couldn't find that load."),
    );
    const { body } = await message("assign AST-1 to load 123");
    expect(body).toMatchObject({ reply: "I couldn't find that load.", actions: [] });
    expect(lastToolResults(model.requests[1])).toEqual([{ isError: true, content: "Cargo not found" }]);
    expect(lastToolResults(model.requests[2])[0]).toMatchObject({ isError: true, content: expect.stringMatching(/cargoId must be an id/) });
  });
});
