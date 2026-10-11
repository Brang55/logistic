import { LngLat } from "../routing/routing.types";

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in meters. */
export function distanceM([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Initial compass bearing from a to b, 0-360 degrees. */
export function bearing([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const y = Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Shortest distance in meters from a point to a polyline. Uses a flat projection around
 * the point, which is accurate at the few-kilometre scale it's used for.
 */
export function distanceToLineM(point: LngLat, line: LngLat[]): number {
  const scaleX = Math.cos(rad(point[1])) * EARTH_RADIUS_M;
  const project = ([lng, lat]: LngLat) => [rad(lng - point[0]) * scaleX, rad(lat - point[1]) * EARTH_RADIUS_M];
  let best = Infinity;
  let [ax, ay] = project(line[0]);
  if (line.length === 1) return Math.hypot(ax, ay);
  for (let i = 1; i < line.length; i++) {
    const [bx, by] = project(line[i]);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    // Closest point on segment a-b to the origin (the point itself).
    const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSq));
    best = Math.min(best, Math.hypot(ax + dx * t, ay + dy * t));
    [ax, ay] = [bx, by];
  }
  return best;
}

/** Drops points closer than `minGapM` to the last kept one, keeping both ends; for drawing long routes. */
export function thinLine(line: LngLat[], minGapM: number): LngLat[] {
  if (line.length < 3) return line;
  const kept = [line[0]];
  for (let i = 1; i < line.length - 1; i++) {
    if (distanceM(kept[kept.length - 1], line[i]) >= minGapM) kept.push(line[i]);
  }
  kept.push(line[line.length - 1]);
  return kept;
}

/** A polyline with precomputed cumulative distances, for walking along it. */
export class Path {
  readonly cumulative: number[];

  constructor(readonly points: LngLat[]) {
    if (points.length < 2) throw new Error("A path needs at least two points");
    this.cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      this.cumulative.push(this.cumulative[i - 1] + distanceM(points[i - 1], points[i]));
    }
  }

  get lengthM() {
    return this.cumulative[this.cumulative.length - 1];
  }

  /** Point and heading at `meters` from the start (clamped to the path). */
  at(meters: number): { point: LngLat; heading: number } {
    const target = Math.min(Math.max(meters, 0), this.lengthM);
    // Binary search for the segment containing the target distance.
    let lo = 0;
    let hi = this.cumulative.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cumulative[mid] <= target) lo = mid;
      else hi = mid;
    }
    const [a, b] = [this.points[lo], this.points[hi]];
    const segment = this.cumulative[hi] - this.cumulative[lo];
    const t = segment === 0 ? 0 : (target - this.cumulative[lo]) / segment;
    return {
      point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      heading: bearing(a, b),
    };
  }

  /**
   * The closest point of the path to `point`: how far along the path it is, and the index of
   * the segment it lies on. When the path passes close by more than once (out and back on the
   * same road), the earliest pass within `toleranceM` of the closest one wins.
   */
  locate(point: LngLat, toleranceM = 25): { alongM: number; index: number; point: LngLat } {
    const scaleX = Math.cos(rad(point[1])) * EARTH_RADIUS_M;
    const project = ([lng, lat]: LngLat) => [rad(lng - point[0]) * scaleX, rad(lat - point[1]) * EARTH_RADIUS_M];
    const hits: { distance: number; t: number }[] = [];
    let [ax, ay] = project(this.points[0]);
    for (let i = 1; i < this.points.length; i++) {
      const [bx, by] = project(this.points[i]);
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSq));
      hits.push({ distance: Math.hypot(ax + dx * t, ay + dy * t), t });
      [ax, ay] = [bx, by];
    }
    const best = hits.reduce((min, hit) => Math.min(min, hit.distance), Infinity);
    const index = hits.findIndex((hit) => hit.distance <= best + toleranceM);
    const { t } = hits[index];
    const [a, b] = [this.points[index], this.points[index + 1]];
    return {
      alongM: this.cumulative[index] + (this.cumulative[index + 1] - this.cumulative[index]) * t,
      index,
      point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    };
  }
}
