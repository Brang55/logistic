import { Module } from "@nestjs/common";
import { DriversModule } from "../drivers/drivers.module";
import { LiveModule } from "../live/live.module";
import { PositionsModule } from "../positions/positions.module";
import { TripsModule } from "../trips/trips.module";
import { CommunityController } from "./community.controller";
import { CommunityService } from "./community.service";

@Module({
  imports: [DriversModule, LiveModule, PositionsModule, TripsModule],
  controllers: [CommunityController],
  providers: [CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}
