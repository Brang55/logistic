import { io } from "socket.io-client";
import { api } from "../../api";
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

export const telematicsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Latest position per truck, kept current by the /live Socket.IO feed while subscribed.
    latestPositions: builder.query<TruckPosition[], void>({
      query: () => "/positions/latest",
      providesTags: ["Positions"],
      async onCacheEntryAdded(_arg, { cacheDataLoaded, cacheEntryRemoved, updateCachedData, dispatch }) {
        try {
          await cacheDataLoaded;
        } catch {
          return;
        }

        const socket = io("/live", {
          // Called on every (re)connect so a refreshed access token is used.
          auth: (cb) => cb({ token: tokenStore.get()?.accessToken }),
          transports: ["websocket"],
        });
        let connectedBefore = false;
        let retry: ReturnType<typeof setTimeout> | undefined;

        socket.on("connect", () => {
          // Positions sent while disconnected were missed; reload the snapshot.
          if (connectedBefore) dispatch(api.util.invalidateTags(["Positions"]));
          connectedBefore = true;
        });

        // The server rejects expired tokens; an authenticated request refreshes the
        // token through the shared base query, then the socket tries again.
        socket.on("connect_error", async (error) => {
          if (error.message !== "unauthorized" || !tokenStore.hasTokens()) return;
          await dispatch(authApi.endpoints.me.initiate(undefined, { forceRefetch: true, subscribe: false }));
          if (tokenStore.hasTokens()) retry = setTimeout(() => socket.connect(), RECONNECT_DELAY_MS);
        });

        socket.on("position", (position: TruckPosition) => {
          updateCachedData((positions) => {
            const index = positions.findIndex((p) => p.truckId === position.truckId);
            if (index === -1) positions.push(position);
            else if (positions[index].recordedAt <= position.recordedAt) positions[index] = position;
          });
        });

        await cacheEntryRemoved;
        clearTimeout(retry);
        socket.close();
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
