import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { advanceRoute } from "../routing/route-progress";
import { RoutePlan } from "../routing/routing.types";
import { distanceM, distanceToLineM } from "../telematics/geo";
import { TruckPosition } from "../telematics/telematics.types";

interface Entry {
  truckId: string;
  signature: string;
  plan: RoutePlan | null;
  fetchedAt: number;
  /** Where the truck was when the route was fetched. */
  from?: TruckPosition["point"];
  pending?: Promise<RoutePlan | null>;
}

// Above this speed a truck counts as driving.
const MOVING_KMH = 5;
// Without a reported speed, a truck this far from where its route was planned has been driving.
const MOVED_M = 1000;

/**
 * Keeps each active trip's route so that driver polls, the traffic monitor and next-pickup
 * lookups share one routing call. A route is fetched again only when the trip's stops or the
 * truck change, the truck leaves the route, or the route gets old (sooner while driving, so
 * traffic stays current). In between, the cached route is advanced to the truck's position.
 */
@Injectable()
export class TripRouteCache {
  private readonly entries = new Map<string, Entry>();
  private readonly movingMaxAgeMs: number;
  private readonly parkedMaxAgeMs: number;
  private readonly offRouteM: number;
  now = () => Date.now();

  constructor(config: ConfigService) {
    this.movingMaxAgeMs = Number(config.get("ROUTE_REFRESH_MOVING_MS") ?? 15 * 60_000);
    this.parkedMaxAgeMs = Number(config.get("ROUTE_REFRESH_PARKED_MS") ?? 60 * 60_000);
    this.offRouteM = Number(config.get("ROUTE_OFF_ROUTE_M") ?? 500);
  }

  /**
   * The route for `key`, reused while `signature` (stops, vehicle) is unchanged and the route
   * is still fresh for the truck's `position`; otherwise `fetch` is called.
   */
  async get(
    key: string,
    truckId: string,
    signature: string,
    position: TruckPosition | undefined,
    fetch: () => Promise<RoutePlan | null>,
  ): Promise<RoutePlan | null> {
    const cached = this.entries.get(key);
    if (cached?.signature === signature) {
      // Concurrent callers share the fetch that is already running.
      if (cached.pending) return cached.pending;
      if (this.isFresh(cached, position)) return cached.plan && position ? advanceRoute(cached.plan, position.point) : cached.plan;
    }

    const entry: Entry = { truckId, signature, plan: null, fetchedAt: this.now(), from: position?.point };
    entry.pending = fetch();
    this.entries.set(key, entry);
    try {
      entry.plan = await entry.pending;
      entry.fetchedAt = this.now();
      return entry.plan;
    } catch (err) {
      // Don't cache failures: the provider may be back on the next call.
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw err;
    } finally {
      entry.pending = undefined;
    }
  }

  /** Forgets routes of trucks that no longer have an active trip. */
  retain(activeTruckIds: Iterable<string>) {
    const active = new Set(activeTruckIds);
    for (const [key, entry] of this.entries) {
      if (!active.has(entry.truckId)) this.entries.delete(key);
    }
  }

  private isFresh(entry: Entry, position: TruckPosition | undefined): boolean {
    const age = this.now() - entry.fetchedAt;
    if (!position) return age < this.parkedMaxAgeMs;

    const moving =
      position.speedKmh !== null ? position.speedKmh > MOVING_KMH : !!entry.from && distanceM(entry.from, position.point) > MOVED_M;
    if (age >= (moving ? this.movingMaxAgeMs : this.parkedMaxAgeMs)) return false;

    const line = entry.plan?.geometry.coordinates;
    return !line?.length || distanceToLineM(position.point, line) <= this.offRouteM;
  }
}
