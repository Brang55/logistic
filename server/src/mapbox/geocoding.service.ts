import { Injectable, Logger } from "@nestjs/common";
import { LngLat } from "../routing/routing.types";
import { MapboxClient } from "./mapbox.client";

interface GeocodeResponse {
  features: { geometry: { coordinates: LngLat } }[];
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(private readonly mapbox: MapboxClient) {}

  // Results are stored on the cargo, so Mapbox's terms require permanent geocoding
  // (which needs a payment method on the Mapbox account).
  async geocode(query: string): Promise<LngLat | null> {
    if (!query.trim()) return null;
    try {
      const res = await this.mapbox.get<GeocodeResponse>("/search/geocode/v6/forward", {
        q: query,
        limit: "1",
        // The fleet operates in the US only for now.
        country: "us",
        permanent: "true",
      });
      return res.features[0]?.geometry.coordinates ?? null;
    } catch (err) {
      this.logger.warn(`Could not geocode "${query}": ${(err as Error).message}`);
      return null;
    }
  }
}
