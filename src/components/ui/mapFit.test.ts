import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map as MapboxMap } from "mapbox-gl";

import { fitPadding, MAP_DETAILS_INSET, mapDetailsInset } from "./mapFit";

const mapOfWidth = (clientWidth: number) => ({ getContainer: () => ({ clientWidth }) }) as unknown as MapboxMap;

const screen = (phone: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: phone && query === "(max-width: 900px)" }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mapDetailsInset", () => {
  it("keeps room for the details card on the right of a wide map", () => {
    screen(false);
    expect(mapDetailsInset(mapOfWidth(1400))).toBe(MAP_DETAILS_INSET);
  });

  it("never takes more than half of a narrower map", () => {
    screen(false);
    expect(mapDetailsInset(mapOfWidth(600))).toBe(300);
  });

  it("keeps no room on phones, where the card sits under the map", () => {
    screen(true);
    expect(mapDetailsInset(mapOfWidth(390))).toBe(0);
  });
});

describe("fitPadding", () => {
  it("is smaller on phones", () => {
    screen(true);
    expect(fitPadding()).toBe(32);
    expect(fitPadding(80)).toBe(32);
    screen(false);
    expect(fitPadding()).toBe(60);
    expect(fitPadding(80)).toBe(80);
  });
});
