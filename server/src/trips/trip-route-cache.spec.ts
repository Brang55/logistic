import { ConfigService } from "@nestjs/config";
import { LngLat, RoutePlan } from "../routing/routing.types";
import { TruckPosition } from "../telematics/telematics.types";
import { TripRouteCache } from "./trip-route-cache";

const MINUTE = 60_000;

const plan = (coordinates: LngLat[]): RoutePlan => ({
  distanceM: 22_000,
  durationS: 1000,
  summary: "",
  geometry: { type: "LineString", coordinates },
  legs: [{ distanceM: 22_000, durationS: 1000 }],
  steps: [],
  notices: [],
  incidents: [],
});

const at = (point: LngLat, speedKmh: number | null = null): TruckPosition => ({
  truckId: "t1",
  point,
  speedKmh,
  heading: null,
  recordedAt: new Date().toISOString(),
});

describe("TripRouteCache", () => {
  let cache: TripRouteCache;
  let clock: number;
  let fetch: jest.Mock<Promise<RoutePlan | null>, []>;
  const get = (position: TruckPosition | undefined, signature = "s1", key = "t1:current", truckId = "t1") =>
    cache.get(key, truckId, signature, position, fetch);

  beforeEach(() => {
    cache = new TripRouteCache(new ConfigService({}));
    clock = 0;
    cache.now = () => clock;
    fetch = jest.fn(async () => plan([[0, 0], [0, 0.2]]));
  });

  it("reuses a route and advances it to the truck", async () => {
    await get(at([0, 0], 80));
    clock += 5 * MINUTE;
    const advanced = await get(at([0, 0.1], 80));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(advanced!.geometry.coordinates[0]).toEqual([0, 0.1]);
    expect(advanced!.durationS).toBeCloseTo(500, 0);
  });

  it("refreshes after 15 minutes while driving and after an hour while parked", async () => {
    await get(at([0, 0], 80));
    clock += 15 * MINUTE;
    await get(at([0, 0.05], 80));
    expect(fetch).toHaveBeenCalledTimes(2);

    clock += 59 * MINUTE;
    await get(at([0, 0.05], 0));
    expect(fetch).toHaveBeenCalledTimes(2);
    clock += MINUTE;
    await get(at([0, 0.05], 0));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("treats a truck without reported speed as driving once it has moved", async () => {
    await get(at([0, 0]));
    clock += 20 * MINUTE;
    await get(at([0, 0.0001]));
    expect(fetch).toHaveBeenCalledTimes(1);
    await get(at([0, 0.05]));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refreshes when the stops change or the truck leaves the route", async () => {
    await get(at([0, 0], 80));
    await get(at([0, 0], 80), "s2");
    expect(fetch).toHaveBeenCalledTimes(2);

    // ~1.1 km east of the route.
    await get(at([0.01, 0.1], 80), "s2");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("shares one fetch between concurrent callers", async () => {
    const [a, b] = await Promise.all([get(at([0, 0], 80)), get(at([0, 0], 80))]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("caches a missing route but not a failed lookup", async () => {
    fetch.mockResolvedValueOnce(null);
    expect(await get(undefined)).toBeNull();
    expect(await get(undefined)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);

    fetch.mockRejectedValueOnce(new Error("provider down"));
    await expect(get(undefined, "s2")).rejects.toThrow("provider down");
    await get(undefined, "s2");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("forgets trucks that are no longer active", async () => {
    await get(undefined, "s1", "t1:current", "t1");
    await get(undefined, "s1", "t2:current", "t2");
    cache.retain(["t2"]);
    await get(undefined, "s1", "t1:current", "t1");
    await get(undefined, "s1", "t2:current", "t2");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
