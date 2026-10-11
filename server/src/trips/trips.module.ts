import { Module } from "@nestjs/common";
import { CargosModule } from "../cargos/cargos.module";
import { DriversModule } from "../drivers/drivers.module";
import { LiveModule } from "../live/live.module";
import { PositionsModule } from "../positions/positions.module";
import { RoutingModule } from "../routing/routing.module";
import { TrafficService } from "./traffic.service";
import { TripRouteCache } from "./trip-route-cache";
import { TripsController } from "./trips.controller";
import { TripsService } from "./trips.service";

@Module({
  imports: [CargosModule, DriversModule, LiveModule, PositionsModule, RoutingModule],
  controllers: [TripsController],
  providers: [TripsService, TrafficService, TripRouteCache],
  exports: [TripsService, TrafficService],
})
export class TripsModule {}
