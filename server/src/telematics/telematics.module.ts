import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthModule } from "../auth/auth.module";
import { RoutingModule } from "../routing/routing.module";
import { TrucksModule } from "../trucks/trucks.module";
import { LiveGateway } from "./live.gateway";
import { PositionsService } from "./positions.service";
import { SimulatedTelematicsProvider } from "./simulated-telematics.provider";
import { TelematicsController } from "./telematics.controller";
import { TelematicsService } from "./telematics.service";
import { TelematicsProvider } from "./telematics.types";

@Module({
  imports: [AuthModule, RoutingModule, TrucksModule],
  controllers: [TelematicsController],
  providers: [
    PositionsService,
    LiveGateway,
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
  exports: [PositionsService, TelematicsService],
})
export class TelematicsModule {}
