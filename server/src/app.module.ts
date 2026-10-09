import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { CargosModule } from "./cargos/cargos.module";
import { PgErrorFilter } from "./common/pg-error.filter";
import { DbModule } from "./db/db.module";
import { DriversModule } from "./drivers/drivers.module";
import { HealthController } from "./health.controller";
import { LoadBoardsModule } from "./loadboards/loadboards.module";
import { MapboxModule } from "./mapbox/mapbox.module";
import { RoutingModule } from "./routing/routing.module";
import { TelematicsModule } from "./telematics/telematics.module";
import { TripsModule } from "./trips/trips.module";
import { VoiceModule } from "./voice/voice.module";
import { TrailersModule } from "./trailers/trailers.module";
import { TrucksModule } from "./trucks/trucks.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    MapboxModule,
    AuthModule,
    TrucksModule,
    TrailersModule,
    DriversModule,
    CargosModule,
    RoutingModule,
    TelematicsModule,
    TripsModule,
    VoiceModule,
    LoadBoardsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: PgErrorFilter }],
})
export class AppModule {}
