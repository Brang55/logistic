import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { CargosModule } from "./cargos/cargos.module";
import { PgErrorFilter } from "./common/pg-error.filter";
import { DbModule } from "./db/db.module";
import { DriversModule } from "./drivers/drivers.module";
import { HealthController } from "./health.controller";
import { TrailersModule } from "./trailers/trailers.module";
import { TrucksModule } from "./trucks/trucks.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthModule,
    TrucksModule,
    TrailersModule,
    DriversModule,
    CargosModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: PgErrorFilter }],
})
export class AppModule {}
