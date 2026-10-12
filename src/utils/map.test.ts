import { afterEach, describe, expect, it, vi } from "vitest";
import { mapGestures } from "./map";

const pointer = (coarse: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: coarse && query === "(pointer: coarse)" }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapGestures", () => {
  it("needs two fingers to move the map on touch screens", () => {
    pointer(true);
    expect(mapGestures()).toEqual({ cooperativeGestures: true });
  });

  it("keeps one-finger drag and wheel zoom with a mouse", () => {
    pointer(false);
    expect(mapGestures()).toEqual({ cooperativeGestures: false });
  });
});
