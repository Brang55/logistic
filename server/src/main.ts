import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { setupApp } from "./setup-app";
import { LiveIoAdapter } from "./live/live-io.adapter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  setupApp(app);

  // Behind a reverse proxy (Caddy in production) so client IPs reach the rate limiter.
  if (config.get("TRUST_PROXY") === "true") app.getHttpAdapter().getInstance().set("trust proxy", 1);

  const corsOrigin = config.get<string>("CORS_ORIGIN")?.split(",") ?? true;
  app.enableCors({ origin: corsOrigin });
  const live = new LiveIoAdapter(app, corsOrigin);
  // Needed once more than one API instance runs; a single instance works without Redis.
  const redisUrl = config.get<string>("REDIS_URL");
  if (redisUrl) await live.connectRedis(redisUrl);
  app.useWebSocketAdapter(live);

  if (config.get("SWAGGER") !== "false") {
    const doc = new DocumentBuilder().setTitle("Logistic API").addBearerAuth().build();
    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, doc));
  }

  await app.listen(config.get("PORT") ?? 3000);
}
bootstrap();
