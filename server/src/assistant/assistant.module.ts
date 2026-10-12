import { Module } from "@nestjs/common";
import { CargosModule } from "../cargos/cargos.module";
import { CommunityModule } from "../community/community.module";
import { DriversModule } from "../drivers/drivers.module";
import { LiveModule } from "../live/live.module";
import { TrailersModule } from "../trailers/trailers.module";
import { TripsModule } from "../trips/trips.module";
import { TrucksModule } from "../trucks/trucks.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { AssistantController } from "./assistant.controller";
import { AssistantModel, ClaudeAssistantModel } from "./assistant.model";
import { AssistantService } from "./assistant.service";
import { AssistantStore } from "./assistant.store";
import { RuleBasedIntentParser } from "./fallback/rule-based.parser";
import { ReplyLinker } from "./reply-links";
import { CargoTools } from "./tools/cargo.tools";
import { DriverTools } from "./tools/driver.tools";
import { FleetDirectory } from "./tools/fleet-directory";
import { FleetTools } from "./tools/fleet.tools";
import { NavigationTools } from "./tools/navigation.tools";

@Module({
  imports: [CargosModule, TrucksModule, DriversModule, TrailersModule, TripsModule, LiveModule, VehiclesModule, CommunityModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AssistantStore,
    FleetDirectory,
    CargoTools,
    FleetTools,
    NavigationTools,
    DriverTools,
    RuleBasedIntentParser,
    ReplyLinker,
    { provide: AssistantModel, useClass: ClaudeAssistantModel },
  ],
})
export class AssistantModule {}
