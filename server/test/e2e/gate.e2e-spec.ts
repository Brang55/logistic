import { createTestApp, GATE_PASSWORD, GATE_TOKEN, TestApp } from "../support/app";

describe("site gate (e2e)", () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.close());

  const unlock = (body: object) => t.api().post("/api/gate").send(body);

  it("sets the gate cookie for the right password, without a login", async () => {
    const res = await unlock({ password: GATE_PASSWORD }).expect(204);
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toContain(`site_gate=${GATE_TOKEN};`);
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("refuses a wrong password without a cookie", async () => {
    const res = await unlock({ password: "wrong" }).expect(401);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects a missing or oversized password", async () => {
    await unlock({}).expect(400);
    await unlock({ password: "x".repeat(201) }).expect(400);
  });
});
