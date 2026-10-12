import { Path } from "../telematics/geo";
import { LngLat, RoutePlan } from "./routing.types";

// Less progress than this isn't worth rewriting the plan for.
const MIN_PROGRESS_M = 1;

/**
 * A route as seen from a truck that has driven part of it since it was planned: the geometry
 * starts at the truck, travelled distance and time come off the legs and totals, and steps
 * already driven are dropped. Durations shrink in proportion to the distance left.
 */
export function advanceRoute(plan: RoutePlan, position: LngLat): RoutePlan {
  const coords = plan.geometry.coordinates;
  if (coords.length < 2) return plan;
  const path = new Path(coords);
  const { alongM, index, point } = path.locate(position);
  if (alongM < MIN_PROGRESS_M) return plan;
  // The engine's distances follow the road, the geometry is a simplified line: scale between them.
  const drivenM = path.lengthM > 0 ? (alongM / path.lengthM) * plan.distanceM : 0;

  const fraction = (distance: number, left: number) => (distance > 0 ? left / distance : 0);
  let travelled = drivenM;
  const legs = plan.legs.map((leg) => {
    const left = Math.max(0, leg.distanceM - travelled);
    travelled = Math.max(0, travelled - leg.distanceM);
    return { distanceM: left, durationS: leg.durationS * fraction(leg.distanceM, left) };
  });

  let stepEndM = 0;
  const steps = plan.steps.filter((step) => {
    stepEndM += step.distanceM;
    return stepEndM > drivenM;
  });

  const distanceM = Math.max(0, plan.distanceM - drivenM);
  const remaining = fraction(plan.distanceM, distanceM);
  return {
    ...plan,
    distanceM,
    durationS: plan.durationS * remaining,
    typicalDurationS: plan.typicalDurationS === undefined ? undefined : plan.typicalDurationS * remaining,
    geometry: { type: "LineString", coordinates: [point, ...coords.slice(index + 1)] },
    legs,
    steps,
  };
}
