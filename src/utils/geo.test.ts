import { describe, expect, it } from "vitest";
import type { LngLat } from "../app/api/routing";
import { distanceKm, splitLineAt } from "./geo";

// One degree along a meridian on the 6,371 km sphere.
const DEGREE_KM = (2 * Math.PI * 6371) / 360;

describe("distanceKm", () => {
  it("measures great-circle distance", () => {
    expect(distanceKm([0, 0], [0, 1])).toBeCloseTo(DEGREE_KM, 6);
    expect(distanceKm([-96.8, 32.78], [-96.8, 32.78])).toBe(0);
    // Dallas to Chicago, about 1,290 km as the crow flies.
    expect(distanceKm([-96.8, 32.78], [-87.63, 41.88])).toBeCloseTo(1290, -1);
  });
});

describe("splitLineAt", () => {
  const line: LngLat[] = [
    [0, 0],
    [0, 1],
    [0, 2],
  ];

  it("splits inside a segment, sharing the split point", () => {
    const [before, after] = splitLineAt(line, (DEGREE_KM * 1000) / 2);
    expect(before).toHaveLength(2);
    expect(before[1][1]).toBeCloseTo(0.5, 9);
    expect(after[0]).toEqual(before[1]);
    expect(after.slice(1)).toEqual([
      [0, 1],
      [0, 2],
    ]);
  });

  it("starts the remaining part at the first point for zero metres", () => {
    expect(splitLineAt(line, 0)).toEqual([[[0, 0], [0, 0]], line]);
  });

  it("returns the whole line when the distance is past its end", () => {
    expect(splitLineAt(line, 10_000_000)).toEqual([line, []]);
  });
});
