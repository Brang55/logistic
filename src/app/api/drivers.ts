import { api } from "./base";
import type { ResourceStatus } from "../../utils/status";

export interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: number | string;
  truckDriverEmail: string;
  /** The truck this driver is seated in; assigning that truck to a load brings them. */
  truckId: string | null;
  truckNumber: string | null;
  content: string;
  status: ResourceStatus;
  userId?: string | null;
}

/**
 * What the API accepts when adding or editing a driver; it manages the status itself.
 * `truckId` seats the driver ("" or null for no truck), which moves that truck's unfinished loads to them.
 */
export type DriverInput = Partial<Omit<Driver, "id" | "status" | "userId" | "truckNumber">>;

// Seating a driver changes trucks and moves loads to the new driver.
const SEATING_TAGS = ["Driver", "AvailableDrivers", "Truck", "AvailableTrucks", "Cargo"] as const;

export const driversApi = api.injectEndpoints({
  endpoints: (builder) => ({
    fetchDrivers: builder.query<Driver[], void>({
      query: () => "/drivers",
      providesTags: ["Driver"],
    }),
    addNewDriver: builder.mutation<Driver, DriverInput>({
      query: (body) => ({ url: "/drivers", method: "POST", body }),
      invalidatesTags: [...SEATING_TAGS],
    }),
    deleteDriver: builder.mutation<void, string>({
      query: (id) => ({ url: `/drivers/${id}`, method: "DELETE" }),
      invalidatesTags: [...SEATING_TAGS],
    }),
    loadDriver: builder.query<Driver, string>({
      query: (id) => `/drivers/${id}`,
      providesTags: ["Driver"],
    }),
    editDriver: builder.mutation<Driver, { id: string } & DriverInput>({
      query: ({ id, ...body }) => ({ url: `/drivers/${id}`, method: "PATCH", body }),
      invalidatesTags: [...SEATING_TAGS],
    }),
    fetchAvailableDrivers: builder.query<Driver[], void>({
      query: () => "/drivers?status=available",
      providesTags: ["AvailableDrivers"],
    }),
    checkDriverEmail: builder.query<{ exists: boolean }, string>({
      query: (email) => ({ url: "/drivers/email-exists", params: { email } }),
    }),
  }),
});

export const {
  useFetchDriversQuery,
  useAddNewDriverMutation,
  useDeleteDriverMutation,
  useLoadDriverQuery,
  useEditDriverMutation,
  useFetchAvailableDriversQuery,
  useLazyCheckDriverEmailQuery,
} = driversApi;
