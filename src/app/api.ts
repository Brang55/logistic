import {
  BaseQueryFn,
  createApi,
  FetchArgs,
  fetchBaseQuery,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { Tokens, tokenStore } from "./tokenStore";

const rawBaseQuery = fetchBaseQuery({
  baseUrl: "/api",
  prepareHeaders: (headers) => {
    const tokens = tokenStore.get();
    if (tokens) headers.set("Authorization", `Bearer ${tokens.accessToken}`);
    return headers;
  },
});

// Concurrent 401s share one refresh request, since each refresh token is single-use.
let refreshing: Promise<boolean> | null = null;

const refreshTokens: BaseQueryFn<void, boolean> = async (_arg, api, extraOptions) => {
  const refreshToken = tokenStore.get()?.refreshToken;
  if (!refreshToken) return { data: false };
  const result = await rawBaseQuery(
    { url: "/auth/refresh", method: "POST", body: { refreshToken } },
    api,
    extraOptions
  );
  if (result.data) {
    tokenStore.set(result.data as Tokens);
    return { data: true };
  }
  tokenStore.clear();
  return { data: false };
};

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions
) => {
  let result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status !== 401 || !tokenStore.hasTokens()) return result;

  refreshing ??= Promise.resolve(refreshTokens(undefined, api, extraOptions))
    .then((res) => !!res.data)
    .finally(() => {
      refreshing = null;
    });
  if (await refreshing) {
    result = await rawBaseQuery(args, api, extraOptions);
  }
  return result;
};

// Single API slice; each feature adds its endpoints with injectEndpoints so that
// cargo assignments can invalidate truck, driver and trailer availability.
export const api = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "Me",
    "Truck",
    "AvailableTrucks",
    "Driver",
    "AvailableDrivers",
    "Trailer",
    "AvailableTrailers",
    "Cargo",
    "Positions",
    "NextPickups",
    "Traffic",
    "MyTrip",
  ],
  endpoints: () => ({}),
});
