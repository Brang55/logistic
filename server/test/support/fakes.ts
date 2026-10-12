import { LngLat, RoutePlan, RouteRequest } from "../../src/routing/routing.types";
import { distanceM as distanceM_ } from "../../src/telematics/geo";

// Fake providers so tests never call Mapbox or TomTom.
export const PLACES: Record<string, LngLat> = {
  Dallas: [-96.8, 32.78],
  Chicago: [-87.63, 41.88],
  Memphis: [-90.05, 35.15],
  // Inside a 3.5 t zone: heavier trucks get a weight violation on the way in.
  "Old Town": [-90.065, 29.958],
  // Short hops near [40, 0] for simulator and next-pickup tests. One simulator tick at 30x covers
  // at least ~1.3 km (speed varies 79-85 km/h), so [40, 0] -> P1 -> D1 (~1.1 km) always finishes in one tick.
  P1: [40, 0.005],
  D1: [40, 0.01],
  P2: [40, 0.02],
  D2: [40, 0.027],
  Far: [45, 5],
  "Walmart DC Temple": [-97.34, 31.1],
};

export const geocoder = { geocode: jest.fn(async (q: string) => PLACES[q] ?? null) };

// Straight lines at 60 km/h, so durations scale with distance.
export const fakeRoute = async ({ coordinates, vehicle }: RouteRequest): Promise<RoutePlan[]> => {
  const intoOldTown = coordinates.some(([x, y]) => x === PLACES["Old Town"][0] && y === PLACES["Old Town"][1]);
  const notices: RoutePlan["notices"] =
    intoOldTown && (vehicle?.weightT ?? 0) > 3.5
      ? [{ type: "violation", subtype: "maxWeight", message: "Vehicle is too heavy for this road" }]
      : [];
  const legs = coordinates.slice(1).map((to, i) => {
    const distanceM = distanceM_(coordinates[i], to);
    return { distanceM, durationS: distanceM / 16.67 };
  });
  const distanceM = legs.reduce((sum, leg) => sum + leg.distanceM, 0);
  return [
    {
      distanceM,
      durationS: distanceM / 16.67,
      summary: "",
      geometry: { type: "LineString", coordinates },
      legs,
      steps: [],
      notices,
      incidents: [],
    },
  ];
};

export const router = {
  route: jest.fn(fakeRoute),
  travelTimes: jest.fn(async (origin: LngLat, destinations: LngLat[]) =>
    destinations.map((d) => ({ durationS: distanceM_(origin, d) / 16.67, distanceM: distanceM_(origin, d) })),
  ),
  maxMatrixDestinations: 9,
};
