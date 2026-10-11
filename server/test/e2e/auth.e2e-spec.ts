import { sql } from "drizzle-orm";
import { AuthService } from "../../src/auth/auth.service";
import { Database } from "../../src/db/client";
import { DB } from "../../src/db/db.module";
import { createTestApp, TestApp } from "../support/app";

describe("auth (e2e)", () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => t.close());

  it("rejects requests without a token", async () => {
    await t.api().get("/api/trucks").expect(401);
  });

  it("logs in, rotates the refresh token and rejects a replayed one", async () => {
    const login = await t
      .api()
      .post("/api/auth/login")
      .send({ email: "dispatcher@test.local", password: "password123" })
      .expect(200);
    expect(login.body.user).toMatchObject({ email: "dispatcher@test.local", role: "dispatcher" });

    const refreshed = await t.api().post("/api/auth/refresh").send({ refreshToken: login.body.refreshToken }).expect(200);
    expect(refreshed.body.refreshToken).not.toEqual(login.body.refreshToken);

    await t.api().post("/api/auth/refresh").send({ refreshToken: login.body.refreshToken }).expect(401);
    // Replay revokes every session for the user, including the newest one.
    await t.api().post("/api/auth/refresh").send({ refreshToken: refreshed.body.refreshToken }).expect(401);
  });

  it("lets only one of two simultaneous refreshes use a token", async () => {
    // Called on the service directly so both requests read the token before either revokes it.
    const auth = t.app.get(AuthService);
    const { refreshToken } = await auth.login("admin@test.local", "password123");
    // Open a few pool connections first, as on a busy server, so both reads really run at once.
    const db = t.app.get<Database>(DB);
    await Promise.all(Array.from({ length: 4 }, () => db.execute(sql`select pg_sleep(0.05)`)));
    const results = await Promise.allSettled([auth.refresh(refreshToken), auth.refresh(refreshToken)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("rejects a wrong password", async () => {
    await t.api().post("/api/auth/login").send({ email: "admin@test.local", password: "nope" }).expect(401);
  });

  it("returns the current user", async () => {
    const me = await t.as(t.tokens.admin)(t.api().get("/api/auth/me")).expect(200);
    expect(me.body).toMatchObject({ email: "admin@test.local", role: "admin" });
  });

  it("only lets admins register accounts", async () => {
    const account = { email: "x@test.local", password: "password123" };
    await t.asDispatcher(t.api().post("/api/auth/register")).send(account).expect(403);
    await t.as(t.tokens.admin)(t.api().post("/api/auth/register")).send(account).expect(201);
  });
});
