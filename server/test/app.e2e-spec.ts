import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/auth/auth.service";
import { setupApp } from "../src/setup-app";
import { TEST_DATABASE_URL } from "./test-env";

describe("API (e2e)", () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let dispatcherToken: string;
  let driverToken: string;

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.JWT_ACCESS_SECRET = "test-secret";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();

    const auth = app.get(AuthService);
    await auth.register("admin@test.local", "password123", "admin");
    await auth.register("dispatcher@test.local", "password123", "dispatcher");
    await auth.register("driver@test.local", "password123", "driver");
    adminToken = (await auth.login("admin@test.local", "password123")).accessToken;
    dispatcherToken = (await auth.login("dispatcher@test.local", "password123")).accessToken;
    driverToken = (await auth.login("driver@test.local", "password123")).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("auth", () => {
    it("rejects requests without a token", async () => {
      await api().get("/api/trucks").expect(401);
    });

    it("logs in, rotates the refresh token and rejects a replayed one", async () => {
      const login = await api()
        .post("/api/auth/login")
        .send({ email: "dispatcher@test.local", password: "password123" })
        .expect(200);
      expect(login.body.user).toMatchObject({ email: "dispatcher@test.local", role: "dispatcher" });

      const refreshed = await api()
        .post("/api/auth/refresh")
        .send({ refreshToken: login.body.refreshToken })
        .expect(200);
      expect(refreshed.body.refreshToken).not.toEqual(login.body.refreshToken);

      await api().post("/api/auth/refresh").send({ refreshToken: login.body.refreshToken }).expect(401);
      // Replay revokes every session for the user, including the newest one.
      await api().post("/api/auth/refresh").send({ refreshToken: refreshed.body.refreshToken }).expect(401);
    });

    it("rejects a wrong password", async () => {
      await api().post("/api/auth/login").send({ email: "admin@test.local", password: "nope" }).expect(401);
    });

    it("returns the current user", async () => {
      const me = await api().get("/api/auth/me").auth(adminToken, { type: "bearer" }).expect(200);
      expect(me.body).toMatchObject({ email: "admin@test.local", role: "admin" });
    });

    it("only lets admins register accounts", async () => {
      await api()
        .post("/api/auth/register")
        .auth(dispatcherToken, { type: "bearer" })
        .send({ email: "x@test.local", password: "password123" })
        .expect(403);
      await api()
        .post("/api/auth/register")
        .auth(adminToken, { type: "bearer" })
        .send({ email: "x@test.local", password: "password123" })
        .expect(201);
    });
  });

  describe("fleet and cargo", () => {
    const asDispatcher = <T extends request.Test>(req: T) => req.auth(dispatcherToken, { type: "bearer" });

    it("creates trucks with dimensions and rejects duplicates", async () => {
      const res = await asDispatcher(api().post("/api/trucks"))
        .send({ truckNumber: "T-1", truckModel: "Volvo FH", heightM: 4, weightT: 40 })
        .expect(201);
      expect(res.body).toMatchObject({ truckNumber: "T-1", status: "available", heightM: 4 });

      await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "T-1" }).expect(409);
      await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "T-2", heightM: 12 }).expect(400);
    });

    it("lets drivers read but not modify the fleet", async () => {
      await api().get("/api/trucks").auth(driverToken, { type: "bearer" }).expect(200);
      await api().post("/api/trucks").auth(driverToken, { type: "bearer" }).send({ truckNumber: "T-9" }).expect(403);
    });

    it("returns 404 for unknown ids and 400 for malformed ones", async () => {
      await asDispatcher(api().get("/api/trucks/00000000-0000-0000-0000-000000000000")).expect(404);
      await asDispatcher(api().get("/api/trucks/undefined")).expect(400);
    });

    it("reports whether a driver email is registered", async () => {
      await asDispatcher(api().post("/api/drivers"))
        .send({ firstName: "A", lastName: "B", truckDriverEmail: "ab@test.local", phoneNumber: 359888 })
        .expect(201);
      const taken = await asDispatcher(api().get("/api/drivers/email-exists?email=ab@test.local")).expect(200);
      const free = await asDispatcher(api().get("/api/drivers/email-exists?email=zz@test.local")).expect(200);
      expect([taken.body.exists, free.body.exists]).toEqual([true, false]);
    });

    it("marks assigned resources taken and frees them on reassignment and delete", async () => {
      const truck = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "T-A" })).body;
      const other = (await asDispatcher(api().post("/api/trucks")).send({ truckNumber: "T-B" })).body;
      const status = async (id: string) => (await asDispatcher(api().get(`/api/trucks/${id}`))).body.status;

      const cargo = (
        await asDispatcher(api().post("/api/cargos"))
          .send({ shipperName: "S", weight: 1200, truckId: truck.id, driverId: "" })
          .expect(201)
      ).body;
      expect(cargo).toMatchObject({ status: "new", weight: "1200", truckId: truck.id, driverId: null });
      expect(await status(truck.id)).toBe("taken");

      const edited = await asDispatcher(api().patch(`/api/cargos/${cargo.id}`)).send({ truckId: other.id }).expect(200);
      expect(edited.body.status).toBe("edited");
      expect([await status(truck.id), await status(other.id)]).toEqual(["available", "taken"]);

      await asDispatcher(api().post(`/api/cargos/${cargo.id}/confirm`)).expect(200);
      const confirmed = await asDispatcher(api().get("/api/cargos?status=confirmed")).expect(200);
      expect(confirmed.body.map((c: { id: string }) => c.id)).toContain(cargo.id);

      await asDispatcher(api().delete(`/api/cargos/${cargo.id}`)).expect(204);
      expect(await status(other.id)).toBe("available");
    });

    it("filters by status", async () => {
      const available = await asDispatcher(api().get("/api/trucks?status=available")).expect(200);
      expect(available.body.every((t: { status: string }) => t.status === "available")).toBe(true);
    });
  });
});
