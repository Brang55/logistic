import { createTestApp, TestApp } from "../support/app";

// Its own app with the production default, so no other file is throttled.
describe("rate limiting (e2e)", () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp({ loginRateLimit: 3 })));
  afterAll(() => t.close());

  it("blocks repeated failed logins from one client", async () => {
    const attempt = () => t.api().post("/api/auth/login").send({ email: "admin@test.local", password: "wrong" });
    for (let i = 0; i < 3; i++) await attempt().expect(401);
    await attempt().expect(429);
  });
});
