import { BadGatewayException, BadRequestException, Injectable } from "@nestjs/common";
import { MapboxApiError, MapboxClient } from "../mapbox/mapbox.client";
import { TtlCache } from "./ttl-cache";
import {
  LngLat,
  RouteIncident,
  RouteNotice,
  RoutePlan,
  RouteRequest,
  RoutingService,
  TravelEstimate,
  VehicleDimensions,
} from "./routing.types";

// Subset of the Directions API v5 response that we use.
interface MapboxNotification {
  type: "violation" | "alert";
  subtype?: string;
  geometry_index?: number;
  geometry_index_start?: number;
  geometry_index_end?: number;
  details?: { message?: string };
}

interface MapboxLeg {
  summary: string;
  distance: number;
  duration: number;
  duration_typical?: number;
  annotation?: { distance?: number[] };
  steps: {
    distance: number;
    duration: number;
    maneuver: { instruction: string; location: LngLat };
  }[];
  notifications?: MapboxNotification[];
  incidents?: {
    id: string;
    type: string;
    description?: string;
    impact?: string;
    closed?: boolean;
    geometry_index_start?: number;
  }[];
}

interface MapboxRoute {
  distance: number;
  duration: number;
  duration_typical?: number;
  geometry: { type: "LineString"; coordinates: LngLat[] };
  legs: MapboxLeg[];
}

interface MatrixResponse {
  code: string;
  durations?: (number | null)[][];
  distances?: (number | null)[][];
}

interface DirectionsResponse {
  code: string;
  message?: string;
  routes: MapboxRoute[];
}

const NO_ROUTE_CODES = new Set(["NoRoute", "NoSegment"]);
const MAX_COORDINATES = 25;
// The traffic-aware matrix accepts 10 coordinates: the origin plus nine destinations.
const MAX_MATRIX_DESTINATIONS = 9;

// Mapbox accepts 0-10 m for height/width and 0-100 t for weight.
const limit = (value: number | null | undefined, max: number) =>
  value && value > 0 ? String(Math.min(Math.round(value * 100) / 100, max)) : undefined;

export const vehicleParams = (vehicle: VehicleDimensions = {}) => ({
  max_height: limit(vehicle.heightM, 10),
  max_width: limit(vehicle.widthM, 10),
  max_weight: limit(vehicle.weightT, 100),
});

@Injectable()
export class MapboxRoutingService extends RoutingService {
  private readonly cache = new TtlCache<RoutePlan[]>(5 * 60_000, 200);

  constructor(private readonly mapbox: MapboxClient) {
    super();
  }

  async route({ coordinates, vehicle, alternatives = true }: RouteRequest): Promise<RoutePlan[]> {
    if (coordinates.length < 2 || coordinates.length > MAX_COORDINATES) {
      throw new BadRequestException(`A route needs between 2 and ${MAX_COORDINATES} coordinates`);
    }

    const path = `/directions/v5/mapbox/driving-traffic/${coordinates.map((c) => c.join(",")).join(";")}`;
    const params = {
      alternatives: String(alternatives),
      geometries: "geojson",
      overview: "full",
      steps: "true",
      // Per-segment distances tell us how many geometry points each leg has.
      annotations: "distance",
      notifications: "all",
      ...vehicleParams(vehicle),
    };
    const key = JSON.stringify([path, params]);
    const cached = this.cache.get(key);
    if (cached) return cached;

    let response: DirectionsResponse;
    try {
      response = await this.mapbox.get<DirectionsResponse>(path, params);
    } catch (err) {
      if (!(err instanceof MapboxApiError)) throw err;
      if (err.code && NO_ROUTE_CODES.has(err.code)) return [];
      if (err.status < 500 && err.status !== 401 && err.status !== 403) throw new BadRequestException(err.message);
      throw new BadGatewayException("Routing provider is unavailable");
    }

    const plans = NO_ROUTE_CODES.has(response.code) ? [] : response.routes.map(toPlan);
    this.cache.set(key, plans);
    return plans;
  }

  // Note: the Matrix API has no vehicle-size parameters, so these are car travel times.
  async travelTimes(origin: LngLat, destinations: LngLat[]): Promise<TravelEstimate[]> {
    if (!destinations.length) return [];
    if (destinations.length > MAX_MATRIX_DESTINATIONS) {
      throw new BadRequestException(`At most ${MAX_MATRIX_DESTINATIONS} destinations per request`);
    }
    const path = `/directions-matrix/v1/mapbox/driving-traffic/${[origin, ...destinations].map((c) => c.join(",")).join(";")}`;
    let response: MatrixResponse;
    try {
      // Destinations include the origin itself, because a request needs at least two elements.
      response = await this.mapbox.get<MatrixResponse>(path, { sources: "0", annotations: "duration,distance" });
    } catch (err) {
      if (err instanceof MapboxApiError && err.status < 500 && err.status !== 401 && err.status !== 403) {
        throw new BadRequestException(err.message);
      }
      throw new BadGatewayException("Routing provider is unavailable");
    }
    // With two or more unreachable destinations Mapbox answers NoRoute for the whole matrix,
    // so split the batch until the reachable ones get their times.
    if (NO_ROUTE_CODES.has(response.code)) {
      if (destinations.length === 1) return [{ durationS: null, distanceM: null }];
      const half = Math.ceil(destinations.length / 2);
      return [
        ...(await this.travelTimes(origin, destinations.slice(0, half))),
        ...(await this.travelTimes(origin, destinations.slice(half))),
      ];
    }
    const durations = response.durations?.[0] ?? [];
    const distances = response.distances?.[0] ?? [];
    return destinations.map((_, i) => ({ durationS: durations[i + 1] ?? null, distanceM: distances[i + 1] ?? null }));
  }
}

function toPlan(route: MapboxRoute): RoutePlan {
  const coords = route.geometry.coordinates;
  const notices: RouteNotice[] = [];
  const incidents: RouteIncident[] = [];
  let legOffset = 0;

  for (const leg of route.legs) {
    for (const n of leg.notifications ?? []) {
      notices.push({
        type: n.type,
        subtype: n.subtype ?? n.type,
        message: n.details?.message ?? n.subtype ?? n.type,
        coordinates: noticeCoordinates(coords, legOffset, n),
      });
    }
    for (const i of leg.incidents ?? []) {
      incidents.push({
        id: i.id,
        type: i.type,
        description: i.description ?? i.type,
        impact: i.impact ?? "unknown",
        closed: i.closed ?? false,
        location: i.geometry_index_start === undefined ? undefined : coords[legOffset + i.geometry_index_start],
      });
    }
    // Leg geometry indices are relative to the leg; a leg with n segments has n + 1 points
    // and shares its first point with the previous leg's last point.
    legOffset += leg.annotation?.distance?.length ?? 0;
  }

  return {
    distanceM: route.distance,
    durationS: route.duration,
    typicalDurationS: route.duration_typical,
    summary: route.legs.map((leg) => leg.summary).filter(Boolean).join(" → "),
    geometry: route.geometry,
    legs: route.legs.map((leg) => ({ distanceM: leg.distance, durationS: leg.duration })),
    steps: route.legs.flatMap((leg) =>
      leg.steps.map((step) => ({
        instruction: step.maneuver.instruction,
        distanceM: step.distance,
        durationS: step.duration,
        location: step.maneuver.location,
      })),
    ),
    notices,
    incidents,
  };
}

function noticeCoordinates(coords: LngLat[], offset: number, n: MapboxNotification): LngLat[] | undefined {
  if (n.geometry_index_start !== undefined && n.geometry_index_end !== undefined) {
    return coords.slice(offset + n.geometry_index_start, offset + n.geometry_index_end + 1);
  }
  if (n.geometry_index !== undefined) return [coords[offset + n.geometry_index]];
  return undefined;
}
