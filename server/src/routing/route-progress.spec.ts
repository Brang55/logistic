import { distanceM } from "../telematics/geo";
import { advanceRoute } from "./route-progress";
import { LngLat, RoutePlan } from "./routing.types";

const A: LngLat = [0, 0];
const B: LngLat = [0, 0.1];
const C: LngLat = [0, 0.2];
const leg = distanceM(A, B);

const plan: RoutePlan = {
  distanceM: 2 * leg,
  durationS: 1000,
  typicalDurationS: 800,
  summary: "A → C",
  geometry: { type: "LineString", coordinates: [A, B, C] },
  legs: [
    { distanceM: leg, durationS: 400 },
    { distanceM: leg, durationS: 600 },
  ],
  steps: [
    { instruction: "Head north", distanceM: leg / 2, durationS: 200, location: A },
    { instruction: "Keep straight", distanceM: leg / 2, durationS: 200, location: [0, 0.05] },
    { instruction: "Continue to C", distanceM: leg, durationS: 600, location: B },
  ],
  notices: [],
  incidents: [],
};

describe("advanceRoute", () => {
  it("leaves the plan alone when the truck is still at the start", () => {
    expect(advanceRoute(plan, A)).toBe(plan);
  });

  it("takes the driven part off the geometry, legs, totals and steps", () => {
    const advanced = advanceRoute(plan, [0, 0.075]);

    expect(advanced.geometry.coordinates).toEqual([[0, 0.075], B, C]);
    expect(advanced.legs[0].distanceM / leg).toBeCloseTo(0.25, 3);
    expect(advanced.legs[0].durationS).toBeCloseTo(100, 0);
    expect(advanced.legs[1]).toEqual(plan.legs[1]);
    expect(advanced.distanceM / plan.distanceM).toBeCloseTo(0.625, 3);
    expect(advanced.durationS).toBeCloseTo(625, 0);
    expect(advanced.typicalDurationS).toBeCloseTo(500, 0);
    expect(advanced.steps.map((s) => s.instruction)).toEqual(["Keep straight", "Continue to C"]);
  });

  it("carries progress past a stop into the next leg", () => {
    const advanced = advanceRoute(plan, [0, 0.15]);

    expect(advanced.legs[0]).toEqual({ distanceM: 0, durationS: 0 });
    expect(advanced.legs[1].durationS).toBeCloseTo(300, 0);
    expect(advanced.geometry.coordinates).toEqual([[0, 0.15], C]);
  });
});
