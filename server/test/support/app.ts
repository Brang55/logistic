import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { mkdtempSync } from "fs";
import { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../../src/app.module";
import { AssistantModel } from "../../src/assistant/assistant.model";
import { AuthService } from "../../src/auth/auth.service";
import { GeocodingService } from "../../src/mapbox/geocoding.service";
import { RoutingService } from "../../src/routing/routing.types";
import { setupApp } from "../../src/setup-app";
import { TEST_DATABASE_URL } from "../test-env";
import { truncateAll } from "./db";
import { geocoder, router } from "./fakes";

export const WEBHOOK_SECRET = "test-webhook-secret";
export const PASSWORD = "password123";

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/**
 * Boots the whole API against an emptied test database, with fake geocoding and routing,
 * and signs in one admin, one dispatcher and one driver (a driver user without a driver record).
 */
export async function createTestApp({ loginRateLimit = 1000, assistantModel }: { loginRateLimit?: number; assistantModel?: AssistantModel } = {}) {
  const uploadDir = mkdtempSync(join(tmpdir(), "logistic-uploads-"));
  Object.assign(process.env, {
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_ACCESS_SECRET: "test-secret",
    TELEMATICS_PROVIDER: "none",
    TRAFFIC_MONITOR_INTERVAL_MS: "0",
    LOADBOARD_SYNC_INTERVAL_MS: "0",
    COMPLIANCE_CHECK_INTERVAL_MS: "0",
    LOGIN_RATE_LIMIT: String(loginRateLimit),
    UPLOAD_DIR: uploadDir,
    // Voice commands use the keyword parser in tests.
    ANTHROPIC_API_KEY: "",
    TELEMATICS_WEBHOOK_SECRET: WEBHOOK_SECRET,
  });
  await truncateAll();

  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GeocodingService)
    .useValue(geocoder)
    .overrideProvider(RoutingService)
    .useValue(router);
  // The assistant only runs against a scripted model in tests.
  if (assistantModel) builder = builder.overrideProvider(AssistantModel).useValue(assistantModel);
  const moduleRef = await builder.compile();
  const app: INestApplication<App> = moduleRef.createNestApplication();
  setupApp(app);
  // Listen on a real port so Socket.IO clients can connect.
  await app.listen(0);

  const auth = app.get(AuthService);
  const signIn = async (email: string, role: "admin" | "dispatcher" | "driver") => {
    await auth.register(email, PASSWORD, role);
    return (await auth.login(email, PASSWORD)).accessToken;
  };
  const tokens = {
    admin: await signIn("admin@test.local", "admin"),
    dispatcher: await signIn("dispatcher@test.local", "dispatcher"),
    driver: await signIn("driver@test.local", "driver"),
  };

  const api = () => request(app.getHttpServer());
  const as =
    (token: string) =>
    <T extends request.Test>(req: T) =>
      req.auth(token, { type: "bearer" });

  return {
    app,
    api,
    tokens,
    uploadDir,
    as,
    asDispatcher: as(tokens.dispatcher),
    liveUrl: () => {
      const server = app.getHttpServer() as unknown as { address(): AddressInfo };
      return `http://localhost:${server.address().port}/live`;
    },
    close: () => app.close(),
  };
}
