import { api } from "../../api";
import { Tokens, tokenStore } from "../../tokenStore";

export type UserRole = "admin" | "dispatcher" | "driver";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

interface Credentials {
  email: string;
  password: string;
}

export const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Creating accounts is admin-only on the server.
    registerUser: builder.mutation<AuthUser, Credentials & { role?: UserRole }>({
      query: (body) => ({ url: "/auth/register", method: "POST", body }),
    }),
    loginUser: builder.mutation<AuthUser, Credentials>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      // Store tokens before the mutation resolves so the next request is authenticated.
      transformResponse: (res: Tokens & { user: AuthUser }) => {
        tokenStore.set(res);
        return res.user;
      },
      invalidatesTags: ["Me"],
    }),
    me: builder.query<AuthUser, void>({
      query: () => "/auth/me",
      providesTags: ["Me"],
    }),
    logoutUser: builder.mutation<void, string>({
      query: (refreshToken) => ({ url: "/auth/logout", method: "POST", body: { refreshToken } }),
    }),
  }),
});

export const {
  useRegisterUserMutation,
  useLoginUserMutation,
  useMeQuery,
  useLogoutUserMutation,
} = authApi;
