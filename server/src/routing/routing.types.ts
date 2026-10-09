export type LngLat = [number, number];

/** Vehicle limits passed to the routing engine; omitted values use the engine's defaults. */
export interface VehicleDimensions {
  heightM?: number | null;
  widthM?: number | null;
  weightT?: number | null;
}

export interface RouteRequest {
  coordinates: LngLat[];
  vehicle?: VehicleDimensions;
  alternatives?: boolean;
}

export interface RouteStep {
  instruction: string;
  distanceM: number;
  durationS: number;
  location: LngLat;
}

/** A restriction violation (e.g. low bridge) or alert (e.g. border crossing) on the route. */
export interface RouteNotice {
  type: "violation" | "alert";
  subtype: string;
  message: string;
  /** Affected part of the route geometry, when the engine reports one. */
  coordinates?: LngLat[];
}

export interface RouteIncident {
  id: string;
  type: string;
  description: string;
  impact: string;
  closed: boolean;
  location?: LngLat;
}

export interface RoutePlan {
  distanceM: number;
  durationS: number;
  /** Duration under typical traffic, when live traffic was considered. */
  typicalDurationS?: number;
  summary: string;
  geometry: { type: "LineString"; coordinates: LngLat[] };
  steps: RouteStep[];
  notices: RouteNotice[];
  incidents: RouteIncident[];
}

/** Routing engine abstraction so Mapbox can be swapped for a truck-specialised provider later. */
export abstract class RoutingService {
  abstract route(request: RouteRequest): Promise<RoutePlan[]>;
}
