import { newCargo, newDriverWithLogin, newTruck } from "../support/actors";
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
    truck = await newTruck(t, { truckNumber: "AST-1", weightT: 20 });
    dallasLoad = await newCargo(t, "Dallas", "Chicago", { weight: "18144" });
  });
  afterAll(() => t.close());

  it("is for staff only", async () => {
    const vic = await newDriverWithLogin(t, { firstName: "Ann", lastName: "Driver", email: "ann@test.local" });
    await t.as(vic.token)(t.api().post("/api/assistant/message")).send({ text: "hi" }).expect(403);
    const status = await t.asDispatcher(t.api().get("/api/assistant")).expect(200);
    expect(status.body).toEqual({ enabled: true, model: "scripted" });
  });

  it("looks things up, proposes an assignment, and only assigns it once confirmed", async () => {
    assignScript("Dallas", "AST-1");
    const res = await message("assign truck AST-1 to the Dallas load", { page: "/dispatcher" });

    expect(res.body.reply).toContain("Please confirm");
    expect(res.body.actions).toHaveLength(1);
    expect(res.body.actions[0]).toMatchObject({ tool: "assign_cargo", title: "Assign load", warnings: [] });
    expect(res.body.actions[0].summary).toMatch(/^Assign truck AST-1 to SH-\w{6} \(Dallas → Chicago\)$/);
    // The model saw today's date, the open page, and imperial units in the lookup.
    expect(lastUserText(model.requests[0])).toContain("Open page: /dispatcher.");
    expect(lastToolResults(model.requests[1])[0].content).toContain('"weightLb":40001');
    expect((await loadCargo(dallasLoad.id)).truckId).toBeNull();

    const done = await confirm(res.body.actions[0].id).expect(200);
    expect(done.body.message).toMatch(/^Assignment saved for SH-/);
    expect(done.body.link).toEqual({ type: "navigate", path: `/cargoList/${dallasLoad.id}/preview`, label: expect.any(String) });
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
    await newTruck(t, { truckNumber: "HEAVY-1", weightT: 30 });
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
