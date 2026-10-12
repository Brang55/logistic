import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// RTK Query builds Request objects from "/api/..." paths. Node's Request (used under jsdom) needs
// absolute URLs and its own AbortSignal type, so resolve against the page and drop jsdom's signal.
const NodeRequest = globalThis.Request;
globalThis.Request = class extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const options = { ...init };
    delete options.signal;
    super(typeof input === "string" ? new URL(input, window.location.origin) : input, options);
  }
} as typeof Request;
