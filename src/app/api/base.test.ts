import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockApi, newStore, type ApiCall } from "../../test/api";
import { tokenStore } from "../tokenStore";
import { api } from "./base";

const probeApi = api.injectEndpoints({
  endpoints: (builder) => ({
    probe: builder.query<{ ok: boolean }, string>({ query: (path) => path }),
  }),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The API accepts only the refreshed access token, and the first refresh token exactly once.
const server = (refreshDelayMs = 0) => {
  let refreshTokenUsed = false;
  return async ({ method, path, auth, body }: ApiCall) => {
    if (method === "POST" && path === "/api/auth/refresh") {
      await sleep(refreshDelayMs);
      const { refreshToken } = body as { refreshToken: string };
      if (refreshToken !== "refresh-1" || refreshTokenUsed) return json(401, { message: "Invalid refresh token" });
      refreshTokenUsed = true;
      return json(200, { accessToken: "access-2", refreshToken: "refresh-2" });
    }
    return auth === "Bearer access-2" ? json(200, { ok: true }) : json(401, { message: "Unauthorized" });
  };
};

describe("API base query", () => {
  let store: ReturnType<typeof newStore>;
  const probe = (path: string) => store.dispatch(probeApi.endpoints.probe.initiate(path));
  const refreshCalls = (calls: ApiCall[]) => calls.filter((call) => call.path === "/api/auth/refresh");

  beforeEach(() => {
    store = newStore();
    tokenStore.set({ accessToken: "access-1", refreshToken: "refresh-1" });
  });

  afterEach(() => {
    tokenStore.clear();
    vi.unstubAllGlobals();
  });

  it("sends the access token", async () => {
    const calls = mockApi(() => json(200, { ok: true }));
    await probe("/trucks");
    expect(calls).toEqual([{ method: "GET", path: "/api/trucks", auth: "Bearer access-1", body: undefined }]);
  });

  it("refreshes an expired access token and retries the request", async () => {
    const calls = mockApi(server());
    const result = await probe("/trucks");

    expect(result.data).toEqual({ ok: true });
    expect(calls.map((call) => `${call.method} ${call.path} ${call.auth ?? ""}`)).toEqual([
      "GET /api/trucks Bearer access-1",
      "POST /api/auth/refresh Bearer access-1",
      "GET /api/trucks Bearer access-2",
    ]);
    expect(refreshCalls(calls)[0].body).toEqual({ refreshToken: "refresh-1" });
    expect(tokenStore.get()).toEqual({ accessToken: "access-2", refreshToken: "refresh-2" });
  });

  it("shares one refresh between requests that fail at the same time", async () => {
    // Refresh tokens are single-use: a second refresh with the same token would sign the user out.
    const calls = mockApi(server(30));
    const results = await Promise.all([probe("/trucks"), probe("/drivers"), probe("/cargos")]);

    expect(results.map((result) => result.data)).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCalls(calls)).toHaveLength(1);
    expect(tokenStore.get()?.refreshToken).toBe("refresh-2");
  });

  it("signs out when the refresh token is refused", async () => {
    tokenStore.set({ accessToken: "access-1", refreshToken: "revoked" });
    const calls = mockApi(server());
    const result = await probe("/trucks");

    expect(result.error).toMatchObject({ status: 401 });
    expect(refreshCalls(calls)).toHaveLength(1);
    expect(tokenStore.get()).toBeNull();
  });

  it("doesn't try to refresh when nobody is signed in", async () => {
    tokenStore.clear();
    const calls = mockApi(server());
    const result = await probe("/trucks");

    expect(result.error).toMatchObject({ status: 401 });
    expect(calls).toHaveLength(1);
  });
});
