import { api } from "../../api";

export interface Trailer {
  id: string;
  trailer: string;
  status: string;
  trailerNumber: string;
}

export const trailersApi = api.injectEndpoints({
  endpoints: (builder) => ({
    fetchTrailers: builder.query<Trailer[], void>({
      query: () => "/trailers",
      providesTags: ["Trailer"],
    }),
    addNewTrailer: builder.mutation<Trailer, Omit<Trailer, "id">>({
      query: (body) => ({ url: "/trailers", method: "POST", body }),
      invalidatesTags: ["Trailer", "AvailableTrailers"],
    }),
    deleteTrailer: builder.mutation<void, string>({
      query: (id) => ({ url: `/trailers/${id}`, method: "DELETE" }),
      invalidatesTags: ["Trailer", "AvailableTrailers"],
    }),
    loadTrailer: builder.query<Trailer, string>({
      query: (id) => `/trailers/${id}`,
      providesTags: ["Trailer"],
    }),
    editTrailer: builder.mutation<Trailer, Trailer>({
      query: ({ id, ...body }) => ({ url: `/trailers/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Trailer", "AvailableTrailers"],
    }),
    fetchAvailableTrailers: builder.query<Trailer[], void>({
      query: () => "/trailers?status=available",
      providesTags: ["AvailableTrailers"],
    }),
  }),
});
export const {
  useFetchTrailersQuery,
  useAddNewTrailerMutation,
  useDeleteTrailerMutation,
  useLoadTrailerQuery,
  useEditTrailerMutation,
  useFetchAvailableTrailersQuery,
} = trailersApi;
