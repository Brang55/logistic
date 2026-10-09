import { api } from "../../api";

interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: number | string;
  truckDriverEmail: string;
  truckNumber: string;
  content: string;
  status: string;
  userId?: string | null;
}

export const driversApi = api.injectEndpoints({
  endpoints: (builder) => ({
    fetchDrivers: builder.query<Driver[], void>({
      query: () => "/drivers",
      providesTags: ["Driver"],
    }),
    addNewDriver: builder.mutation<Driver, Omit<Driver, "id">>({
      query: (body) => ({ url: "/drivers", method: "POST", body }),
      invalidatesTags: ["Driver", "AvailableDrivers"],
    }),
    deleteDriver: builder.mutation<void, string>({
      query: (id) => ({ url: `/drivers/${id}`, method: "DELETE" }),
      invalidatesTags: ["Driver", "AvailableDrivers"],
    }),
    loadDriver: builder.query<Driver, string>({
      query: (id) => `/drivers/${id}`,
      providesTags: ["Driver"],
    }),
    editDriver: builder.mutation<Driver, Driver>({
      query: ({ id, ...body }) => ({ url: `/drivers/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Driver", "AvailableDrivers"],
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
