import type { LngLat } from "../app/api/routing";

/** Straight-line (great-circle) distance in kilometres. */
export function distanceKm([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Splits a line at `meters` along it, into the part before and the part after. */
export function splitLineAt(line: LngLat[], meters: number): [LngLat[], LngLat[]] {
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const segment = distanceKm(line[i - 1], line[i]) * 1000;
    if (walked + segment >= meters) {
      const t = segment === 0 ? 0 : (meters - walked) / segment;
      const [a, b] = [line[i - 1], line[i]];
      const at: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      return [[...line.slice(0, i), at], [at, ...line.slice(i)]];
    }
    walked += segment;
  }
  return [line, []];
}
