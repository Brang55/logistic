export type LngLat = [number, number];

/** Vehicle limits passed to the routing engine; omitted values use the engine's defaults. */
export interface VehicleDimensions {
  heightM?: number | null;
  widthM?: number | null;
  weightT?: number | null;
  lengthM?: number | null;
  axles?: number | null;
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
  /** One entry per pair of consecutive stops. */
  legs: { distanceM: number; durationS: number }[];
  steps: RouteStep[];
  notices: RouteNotice[];
  incidents: RouteIncident[];
}

/** Drive time and distance from one origin to each destination; null when unreachable. */
export interface TravelEstimate {
  durationS: number | null;
  distanceM: number | null;
}

/** Routing engine abstraction: TomTom truck routing, or Mapbox when no TomTom key is set. */
export abstract class RoutingService {
  abstract route(request: RouteRequest): Promise<RoutePlan[]>;

  /** At most `maxMatrixDestinations` destinations per call. Engines without truck support ignore `vehicle`. */
  abstract travelTimes(origin: LngLat, destinations: LngLat[], vehicle?: VehicleDimensions): Promise<TravelEstimate[]>;

  readonly maxMatrixDestinations: number = 9;
}
