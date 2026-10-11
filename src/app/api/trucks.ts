import { api } from "./base";
import type { ResourceStatus } from "../../utils/status";

export interface Truck {
  id: string;
  status: ResourceStatus;
  truckNumber: string;
  truckModel: string;
  engineVariation: string;
  plate?: string | null;
  vin?: string | null;
  heightM?: number | null;
  widthM?: number | null;
  lengthM?: number | null;
  weightT?: number | null;
  axles?: number | null;
  odometerKm?: number | null;
}

export const trucksApi = api.injectEndpoints({
  endpoints: (builder) => ({
    fetchTrucks: builder.query<Truck[], void>({
      query: () => "/trucks",
      providesTags: ["Truck"],
    }),
    addNewTruck: builder.mutation<Truck, Omit<Truck, "id">>({
      query: (body) => ({ url: "/trucks", method: "POST", body }),
      invalidatesTags: ["Truck", "AvailableTrucks"],
    }),
    deleteTruck: builder.mutation<void, string>({
      query: (id) => ({ url: `/trucks/${id}`, method: "DELETE" }),
      invalidatesTags: ["Truck", "AvailableTrucks"],
    }),
    loadTruck: builder.query<Truck, string>({
      query: (id) => `/trucks/${id}`,
      providesTags: ["Truck"],
    }),
    editTruck: builder.mutation<Truck, Truck>({
      query: ({ id, ...body }) => ({ url: `/trucks/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Truck", "AvailableTrucks"],
    }),
    fetchAvailableTrucks: builder.query<Truck[], void>({
      query: () => "/trucks?status=available",
      providesTags: ["AvailableTrucks"],
    }),
  }),
});

export const {
  useFetchTrucksQuery,
  useAddNewTruckMutation,
  useDeleteTruckMutation,
  useLoadTruckQuery,
  useEditTruckMutation,
  useFetchAvailableTrucksQuery,
} = trucksApi;
