import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CargosModule } from "../cargos/cargos.module";
import { LiveModule } from "../live/live.module";
import { PositionsModule } from "../positions/positions.module";
import { RoutingModule } from "../routing/routing.module";
import { TripsModule } from "../trips/trips.module";
import { TrucksModule } from "../trucks/trucks.module";
import { SimulatedTelematicsProvider } from "./simulated-telematics.provider";
import { TelematicsController } from "./telematics.controller";
import { TelematicsService } from "./telematics.service";
import { TelematicsProvider } from "./telematics.types";

@Module({
  imports: [CargosModule, LiveModule, PositionsModule, RoutingModule, TripsModule, TrucksModule],
  controllers: [TelematicsController],
  providers: [
    TelematicsService,
    SimulatedTelematicsProvider,
    // TELEMATICS_PROVIDER picks the push-based source; webhooks work regardless.
    {
      provide: TelematicsProvider,
      inject: [ConfigService, SimulatedTelematicsProvider],
      useFactory: (config: ConfigService, simulator: SimulatedTelematicsProvider) =>
        config.get("TELEMATICS_PROVIDER") === "simulator" ? simulator : null,
    },
  ],
  exports: [TelematicsService],
})
export class TelematicsModule {}
