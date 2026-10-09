import { Module } from "@nestjs/common";
import { TrucksModule } from "../trucks/trucks.module";
import { MapboxRoutingService } from "./mapbox-routing.service";
import { RoutingController } from "./routing.controller";
import { RoutingService } from "./routing.types";

@Module({
  imports: [TrucksModule],
  controllers: [RoutingController],
  providers: [{ provide: RoutingService, useClass: MapboxRoutingService }],
  exports: [RoutingService],
})
export class RoutingModule {}
