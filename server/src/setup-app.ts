import { INestApplication, ValidationPipe } from "@nestjs/common";

// Shared by main.ts and the e2e tests so both run the same HTTP pipeline.
export function setupApp(app: INestApplication) {
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableShutdownHooks();
}
