import { configureStore } from "@reduxjs/toolkit";
import { vi } from "vitest";
import { api } from "../app/api/base";

/** One request the app sent to the API. */
export interface ApiCall {
  method: string;
  path: string;
  auth: string | null;
  body?: unknown;
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Replaces fetch with `handler` and records every call made through it. */
export function mockApi(handler: (call: ApiCall) => Response | Promise<Response>) {
  const calls: ApiCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) => {
      const text = request.method === "GET" ? "" : await request.text();
      const call: ApiCall = {
        method: request.method,
        path: new URL(request.url).pathname,
        auth: request.headers.get("authorization"),
        body: text ? JSON.parse(text) : undefined,
      };
      calls.push(call);
      return handler(call);
    })
  );
  return calls;
}

/** A fresh store with the real API slice, as the app configures it. */
export const newStore = () =>
  configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
  });
