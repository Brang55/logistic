import { api } from "../../api";
import { acquireLiveSocket } from "../../liveSocket";
import type Cargo from "./cargoSlice";
import type { LngLat, RouteIncident, RouteNotice, RoutePlan } from "./routingSlice";
import type { TruckPosition } from "./telematicsSlice";
import type { Truck } from "./truckSlice";

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
  reportedDelay: { minutes: number; reason: string | null; at: string } | null;
}

export interface LiveAlert {
  id: string;
  kind: "delay-reported" | "traffic-delay" | "incident";
  severity: "info" | "warning" | "critical";
  message: string;
  cargoId?: string;
  truckId?: string;
  createdAt: string;
}

export type VoiceAction =
  | "report_delay"
  | "confirm_pickup"
  | "confirm_delivery"
  | "set_pickup_location"
  | "set_delivery_location"
  | "next_stop"
  | "unknown";

export interface VoiceProposal {
  intent: {
    action: VoiceAction;
    delayMinutes: number | null;
    reason: string | null;
    location: string | null;
    clarification: string | null;
  };
  parser: string;
  needsConfirmation: boolean;
  cargoId?: string;
  reply: string;
}

export interface VoiceExecution {
  action: Exclude<VoiceAction, "next_stop" | "unknown">;
  cargoId: string;
  delayMinutes?: number;
  reason?: string;
  location?: string;
}

export interface MyTrip {
  driver: { id: string; firstName: string; lastName: string };
  trip: {
    truck: Truck;
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
      invalidatesTags: ["MyTrip"],
    }),
    reportDelay: builder.mutation<Cargo, { cargoId: string; minutes: number; reason?: string }>({
      query: ({ cargoId, ...body }) => ({ url: `/me/trip/${cargoId}/delay`, method: "POST", body }),
      invalidatesTags: ["MyTrip"],
    }),
    interpretVoice: builder.mutation<VoiceProposal, string>({
      query: (transcript) => ({ url: "/me/voice/interpret", method: "POST", body: { transcript } }),
    }),
    executeVoice: builder.mutation<{ reply: string }, VoiceExecution>({
      query: (body) => ({ url: "/me/voice/execute", method: "POST", body }),
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
  useTrafficReportQuery,
  useAlertsQuery,
  useMyTripQuery,
  useMarkPickedUpMutation,
  useMarkDeliveredMutation,
  useReportDelayMutation,
  useCreateDriverAccountMutation,
  useInterpretVoiceMutation,
  useExecuteVoiceMutation,
} = tripsApi;
