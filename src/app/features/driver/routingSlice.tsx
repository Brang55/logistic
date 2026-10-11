import { api } from "../../api";
import type { Truck } from "./truckSlice";

export type LngLat = [number, number];

export interface RouteNotice {
  type: "violation" | "alert";
  subtype: string;
  message: string;
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
  typicalDurationS?: number;
  summary: string;
  geometry: { type: "LineString"; coordinates: LngLat[] };
  legs: { distanceM: number; durationS: number }[];
  steps: { instruction: string; distanceM: number; durationS: number; location: LngLat }[];
  notices: RouteNotice[];
  incidents: RouteIncident[];
}

export interface CargoRoute {
  pickup: LngLat;
  delivery: LngLat;
  /** The load is on board, so a route from the truck goes straight to delivery. */
  pickedUp: boolean;
  truck: Truck | null;
  routes: RoutePlan[];
}

export const routingApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Pickup → delivery using the given truck's height, width and weight limits; with `from`
    // (e.g. the truck's position) the route starts there and legs[0] is the way to the pickup.
    cargoRoute: builder.query<CargoRoute, { cargoId: string; truckId?: string; from?: LngLat }>({
      query: ({ cargoId, truckId, from }) => ({
        url: `/cargos/${cargoId}/route`,
        params: { ...(truckId && { truckId }), ...(from && { from: from.join(",") }) },
      }),
    }),
  }),
});

export const { useCargoRouteQuery } = routingApi;
