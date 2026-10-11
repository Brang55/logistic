import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TomTomClient } from "../tomtom/tomtom.client";
import { TrucksModule } from "../trucks/trucks.module";
import { MapboxRoutingService } from "./mapbox-routing.service";
import { RoutingController } from "./routing.controller";
import { RoutingService } from "./routing.types";
import { TomTomRoutingService } from "./tomtom-routing.service";

@Module({
  imports: [TrucksModule],
  controllers: [RoutingController],
  providers: [
    MapboxRoutingService,
    TomTomRoutingService,
    {
      provide: RoutingService,
      inject: [ConfigService, TomTomClient, MapboxRoutingService, TomTomRoutingService],
      // TomTom routes as a truck; Mapbox only knows height, width and weight on a car profile.
      useFactory: (config: ConfigService, client: TomTomClient, mapbox: MapboxRoutingService, tomtom: TomTomRoutingService) => {
        const provider = config.get<string>("ROUTING_PROVIDER") || (client.isConfigured() ? "tomtom" : "mapbox");
        new Logger(RoutingModule.name).log(`Routing with ${provider === "tomtom" ? "TomTom (truck)" : "Mapbox (car profile)"}`);
        return provider === "tomtom" ? tomtom : mapbox;
      },
    },
  ],
  exports: [RoutingService],
})
export class RoutingModule {}
