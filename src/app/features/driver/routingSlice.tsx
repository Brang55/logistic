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
  steps: { instruction: string; distanceM: number; durationS: number; location: LngLat }[];
  notices: RouteNotice[];
  incidents: RouteIncident[];
}

export interface CargoRoute {
  pickup: LngLat;
  delivery: LngLat;
  truck: Truck | null;
  routes: RoutePlan[];
}

export const routingApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Pickup → delivery using the given truck's height, width and weight limits.
    cargoRoute: builder.query<CargoRoute, { cargoId: string; truckId?: string }>({
      query: ({ cargoId, truckId }) => ({
        url: `/cargos/${cargoId}/route`,
        params: truckId ? { truckId } : undefined,
      }),
    }),
  }),
});

export const { useCargoRouteQuery } = routingApi;
