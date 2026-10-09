import { api } from "../../api";
import { acquireLiveSocket } from "../../liveSocket";
import { tokenStore } from "../../tokenStore";
import { authApi } from "./authSlice";
import type { LngLat } from "./routingSlice";

export interface TruckPosition {
  truckId: string;
  point: LngLat;
  speedKmh: number | null;
  heading: number | null;
  recordedAt: string;
}

const RECONNECT_DELAY_MS = 2000;

// Cargo changes affect the queues and the availability of drivers, trucks and trailers.
const CARGO_TAGS = [
  "Cargo",
  "Driver",
  "AvailableDrivers",
  "Truck",
  "AvailableTrucks",
  "Trailer",
  "AvailableTrailers",
  "Traffic",
  "NextPickups",
] as const;

export const telematicsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Latest position per truck, kept current by the live feed while subscribed. This
    // subscription also refreshes cargo data when the server reports a change.
    latestPositions: builder.query<TruckPosition[], void>({
      query: () => "/positions/latest",
      providesTags: ["Positions"],
      async onCacheEntryAdded(_arg, { cacheDataLoaded, cacheEntryRemoved, updateCachedData, dispatch }) {
        try {
          await cacheDataLoaded;
        } catch {
          return;
        }
        const [socket, release] = acquireLiveSocket();
        let connectedBefore = socket.connected;
        let retry: ReturnType<typeof setTimeout> | undefined;

        const onConnect = () => {
          // Updates sent while disconnected were missed; reload.
          if (connectedBefore) dispatch(api.util.invalidateTags(["Positions", ...CARGO_TAGS]));
          connectedBefore = true;
        };
        // The server rejects expired tokens; an authenticated request refreshes the
        // token through the shared base query, then the socket tries again.
        const onError = async (error: Error) => {
          if (error.message !== "unauthorized" || !tokenStore.hasTokens()) return;
          await dispatch(authApi.endpoints.me.initiate(undefined, { forceRefetch: true, subscribe: false }));
          if (tokenStore.hasTokens()) retry = setTimeout(() => socket.connect(), RECONNECT_DELAY_MS);
        };
        const onPosition = (position: TruckPosition) =>
          updateCachedData((positions) => {
            const index = positions.findIndex((p) => p.truckId === position.truckId);
            if (index === -1) positions.push(position);
            else if (positions[index].recordedAt <= position.recordedAt) positions[index] = position;
          });
        const onCargo = () => dispatch(api.util.invalidateTags([...CARGO_TAGS]));

        socket.on("connect", onConnect);
        socket.on("connect_error", onError);
        socket.on("position", onPosition);
        socket.on("cargo", onCargo);

        await cacheEntryRemoved;
        clearTimeout(retry);
        socket.off("connect", onConnect);
        socket.off("connect_error", onError);
        socket.off("position", onPosition);
        socket.off("cargo", onCargo);
        release();
      },
    }),
    truckHistory: builder.query<TruckPosition[], { truckId: string; since?: string }>({
      query: ({ truckId, since }) => ({
        url: `/trucks/${truckId}/positions`,
        params: since ? { since } : undefined,
      }),
    }),
  }),
});

export const { useLatestPositionsQuery, useTruckHistoryQuery } = telematicsApi;
