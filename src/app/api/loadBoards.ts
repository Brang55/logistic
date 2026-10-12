import { api } from "./base";
import type Cargo from "./cargos";
import type { LngLat } from "./routing";

export interface BoardLoad {
  id: string;
  board: string;
  region: "EU" | "US";
  origin: { city: string; address: string; point: LngLat };
  destination: { city: string; address: string; point: LngLat };
  pickupDate: string;
  deliveryDate: string;
  equipment: string;
  weightKg: number;
  distanceKm: number;
  rate: { amount: number; currency: string };
  commodity: string;
  hazmat: boolean;
  shipper: { name: string };
  bookedByUs: boolean;
  /** Our cargo id when already imported. */
  cargoId: string | null;
  nearestTruck: { truckId: string; truckNumber: string; km: number } | null;
}

export const loadBoardApi = api.injectEndpoints({
  endpoints: (builder) => ({
    boardLoads: builder.query<BoardLoad[], { region?: string; equipment?: string }>({
      query: ({ region, equipment }) => ({
        url: "/loadboards/loads",
        params: { ...(region && { region }), ...(equipment && { equipment }) },
      }),
      providesTags: ["BoardLoads"],
    }),
    importLoad: builder.mutation<{ cargo: Cargo; created: boolean }, { board: string; loadId: string }>({
      query: ({ board, loadId }) => ({ url: `/loadboards/${board}/loads/${loadId}/import`, method: "POST" }),
      invalidatesTags: ["BoardLoads", "Cargo"],
    }),
    syncBookedLoads: builder.mutation<{ imported: { board: string; loadId: string; cargoId: string }[] }, void>({
      query: () => ({ url: "/loadboards/sync", method: "POST" }),
      invalidatesTags: ["BoardLoads", "Cargo"],
    }),
  }),
});

export const { useBoardLoadsQuery, useImportLoadMutation, useSyncBookedLoadsMutation } = loadBoardApi;
