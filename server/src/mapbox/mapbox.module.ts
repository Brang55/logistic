import { Global, Module } from "@nestjs/common";
import { GeocodingService } from "./geocoding.service";
import { MapboxClient } from "./mapbox.client";

@Global()
@Module({
  providers: [MapboxClient, GeocodingService],
  exports: [MapboxClient, GeocodingService],
})
export class MapboxModule {}
