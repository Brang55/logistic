import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { setupApp } from "./setup-app";
import { RedisIoAdapter } from "./telematics/redis-io.adapter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  setupApp(app);

  // Needed once more than one API instance runs; a single instance works without Redis.
  const redisUrl = config.get<string>("REDIS_URL");
  if (redisUrl) {
    const adapter = new RedisIoAdapter(app, redisUrl);
    await adapter.connect();
    app.useWebSocketAdapter(adapter);
  }
  app.enableCors({ origin: config.get("CORS_ORIGIN")?.split(",") ?? true });

  const doc = new DocumentBuilder().setTitle("Logistic API").addBearerAuth().build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, doc));

  await app.listen(config.get("PORT") ?? 3000);
}
bootstrap();
