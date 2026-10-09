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
}
