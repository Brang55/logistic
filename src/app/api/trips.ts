import { api } from "./base";
import { acquireLiveSocket } from "../liveSocket";
import type Cargo from "./cargos";
import type { ReportType } from "./community";
import type { LngLat, RouteIncident, RouteNotice, RoutePlan } from "./routing";
import type { TruckPosition } from "./telematics";
import type { Truck } from "./trucks";

export interface Stop {
  kind: "pickup" | "delivery";
  point: LngLat;
  name: string;
  cargoId: string;
}

export interface NextPickups {
  origin: { point: LngLat; after: "current-position" | "current-loads"; availableAt: string };
  maxDistanceKm: number;
  candidates: {
    cargo: Cargo;
    durationS: number | null;
    distanceM: number | null;
    arrivalAt: string | null;
    onTime: boolean | null;
  }[];
}

/** Where a truck with other unfinished loads will be free: the delivery of its last other load. */
export interface TruckOrigin {
  truckId: string;
  point: LngLat;
  afterCargoId: string;
}

export interface TripTraffic {
  truckId: string;
  truckNumber: string;
  cargoId: string;
  cargo: string;
  nextStop: Stop;
  remainingS: number | null;
  remainingM: number | null;
  etaAt: string | null;
  trafficDelayS: number;
  incidents: RouteIncident[];
  violations: RouteNotice[];
  /** A dispatcher assigned this truck knowing its route breaks truck restrictions. */
  restrictionsAccepted: boolean;
  reportedDelay: { minutes: number; reason: string | null; at: string } | null;
  /** The remaining route from the truck through the load's stops. */
  geometry: LngLat[] | null;
  /** Where along `geometry` the pickup is, while the truck is still heading there. */
  toPickupM: number | null;
  /** Driver road reports on the remaining route. */
  roadReports: RouteReport[];
}

export interface RouteReport {
  id: string;
  type: ReportType;
  label: string;
  note: string;
  point: LngLat;
  createdAt: string;
}

export interface LiveAlert {
  id: string;
  kind: "delay-reported" | "traffic-delay" | "incident" | "address-changed" | "loads-imported" | "compliance" | "road-report" | "route-restriction" | "driver-message";
  severity: "info" | "warning" | "critical";
  message: string;
  cargoId?: string;
  truckId?: string;
  createdAt: string;
}

export interface MyTrip {
  driver: { id: string; firstName: string; lastName: string; truckNumber?: string };
  trip: {
    truck: Truck;
    trailer: { id: string; trailerNumber: string; trailer: string } | null;
    cargo: Cargo;
    queue: Cargo[];
    position?: TruckPosition;
    nextStop: Stop;
    stops: Stop[];
    route: RoutePlan | null;
  } | null;
}

export const tripsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    nextPickups: builder.query<NextPickups, string>({
      query: (truckId) => `/trucks/${truckId}/next-pickups`,
      providesTags: ["NextPickups"],
    }),
    truckOrigins: builder.query<TruckOrigin[], string>({
      query: (cargoId) => `/cargos/${cargoId}/truck-origins`,
      providesTags: ["Cargo"],
    }),
    trafficReport: builder.query<{ checkedAt: string; trips: TripTraffic[] }, void>({
      query: () => "/traffic/report",
      providesTags: ["Traffic"],
    }),
    // Recent alerts, with new ones prepended as they arrive on the live feed.
    alerts: builder.query<LiveAlert[], void>({
      query: () => "/traffic/alerts",
      async onCacheEntryAdded(_arg, { cacheDataLoaded, cacheEntryRemoved, updateCachedData }) {
        try {
          await cacheDataLoaded;
        } catch {
          return;
        }
        const [socket, release] = acquireLiveSocket();
        const onAlert = (alert: LiveAlert) =>
          updateCachedData((alerts) => {
            if (!alerts.some((a) => a.id === alert.id)) alerts.unshift(alert);
          });
        socket.on("alert", onAlert);
        await cacheEntryRemoved;
        socket.off("alert", onAlert);
        release();
      },
    }),

    // Driver app
    myTrip: builder.query<MyTrip, void>({
      query: () => "/me/trip",
      providesTags: ["MyTrip"],
    }),
    markPickedUp: builder.mutation<Cargo, string>({
      query: (cargoId) => ({ url: `/me/trip/${cargoId}/picked-up`, method: "POST" }),
      invalidatesTags: ["MyTrip"],
    }),
    markDelivered: builder.mutation<Cargo, string>({
      query: (cargoId) => ({ url: `/me/trip/${cargoId}/delivered`, method: "POST" }),
      invalidatesTags: ["MyTrip", "DeliveryHistory"],
    }),
    reportDelay: builder.mutation<Cargo, { cargoId: string; minutes: number; reason?: string }>({
      query: ({ cargoId, ...body }) => ({ url: `/me/trip/${cargoId}/delay`, method: "POST", body }),
      invalidatesTags: ["MyTrip"],
    }),
    createDriverAccount: builder.mutation<unknown, { driverId: string; password: string }>({
      query: ({ driverId, password }) => ({ url: `/drivers/${driverId}/account`, method: "POST", body: { password } }),
      invalidatesTags: ["Driver"],
    }),
  }),
});

export const {
  useNextPickupsQuery,
  useTruckOriginsQuery,
  useTrafficReportQuery,
  useAlertsQuery,
  useMyTripQuery,
  useMarkPickedUpMutation,
  useMarkDeliveredMutation,
  useReportDelayMutation,
  useCreateDriverAccountMutation,
} = tripsApi;
