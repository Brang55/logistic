import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CargosService } from "../cargos/cargos.service";
import { PositionsService } from "../positions/positions.service";
import { LngLat, RoutingService } from "../routing/routing.types";
import { stopsOf, Trip, TripsService } from "../trips/trips.service";
import { Path } from "./geo";
import { PositionFix, PositionSink, TelematicsProvider } from "./telematics.types";

interface Leg {
  cargoId: string;
  path: Path;
  progressM: number;
  speedKmh: number;
  /** Distance along the path where the pickup is, when the load still has to be collected. */
  pickupAtM?: number;
  pickedUp: boolean;
  /** Arrived; kept until the load changes so the same load isn't driven again. */
  done: boolean;
  /** Whether the load was already picked up when this leg was planned. */
  plannedPickedUp: boolean;
  /** The driver confirms pickup/delivery in the app; the simulator only drives and waits. */
  driverConfirms: boolean;
}

const CRUISE_KMH = 82;
// Parked trucks still report, like real devices, so they don't show as offline.
const HEARTBEAT_MS = 60_000;

/**
 * Demo telematics: each truck with an active load drives from its last position through
 * the load's remaining stops along a real truck route, at a configurable time-lapse speed.
 * On arrival it marks the load picked up / delivered (like a geofence would), then moves on
 * to the next queued load. When the driver uses the driver app, the truck instead drives to
 * the next stop and waits there for the driver to confirm. Trucks without loads stay put.
 */
@Injectable()
export class SimulatedTelematicsProvider extends TelematicsProvider {
  readonly name = "simulator";
  private readonly logger = new Logger(SimulatedTelematicsProvider.name);
  private readonly legs = new Map<string, Leg>();
  private timers: NodeJS.Timeout[] = [];
  private planning = false;
  private lastHeartbeat = 0;

  private readonly tickMs: number;
  private readonly speedup: number;
  private readonly autoStatus: boolean;

  constructor(
    private readonly trips: TripsService,
    private readonly cargos: CargosService,
    private readonly routing: RoutingService,
    private readonly positions: PositionsService,
    config: ConfigService,
  ) {
    super();
    this.tickMs = Number(config.get("SIMULATOR_TICK_MS") ?? 2000);
    this.speedup = Number(config.get("SIMULATOR_SPEEDUP") ?? 30);
    this.autoStatus = config.get("SIMULATOR_AUTO_STATUS") !== "false";
  }

  start(sink: PositionSink) {
    this.logger.log(`Simulating active trucks every ${this.tickMs} ms at ${this.speedup}x speed`);
    void this.plan();
    this.timers = [
      setInterval(() => void this.tick(sink), this.tickMs),
      // Pick up new or changed assignments.
      setInterval(() => void this.plan(), 15_000),
    ];
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  /** Advances every truck by one tick, reports positions and records arrivals. */
  async tick(sink: PositionSink) {
    const fixes: PositionFix[] = [];
    // Per truck, in order: picked up must be recorded before delivered.
    const arrivals: (() => Promise<unknown>)[][] = [];
    const now = new Date();

    for (const [truckId, leg] of this.legs) {
      if (leg.done) continue;
      const updates: (() => Promise<unknown>)[] = [];
      // Vary speed a little so the demo doesn't look robotic.
      leg.speedKmh = Math.min(90, Math.max(60, leg.speedKmh + (Math.random() - 0.5) * 6));
      leg.progressM += (leg.speedKmh / 3.6) * (this.tickMs / 1000) * this.speedup;

      if (!leg.pickedUp && leg.pickupAtM !== undefined && leg.progressM >= leg.pickupAtM) {
        leg.pickedUp = true;
        updates.push(() => this.cargos.markPickedUp(leg.cargoId));
      }
      leg.done = leg.progressM >= leg.path.lengthM;
      if (leg.done) updates.push(() => this.cargos.markDelivered(leg.cargoId));

      const { point, heading } = leg.path.at(leg.progressM);
      fixes.push({ truckId, point, heading: Math.round(heading), speedKmh: leg.done ? 0 : Math.round(leg.speedKmh), recordedAt: now });
      if (this.autoStatus && !leg.driverConfirms && updates.length) arrivals.push(updates);
    }

    if (now.getTime() - this.lastHeartbeat >= HEARTBEAT_MS) {
      this.lastHeartbeat = now.getTime();
      // Stored positions predate this tick, so a truck that just moved (or just arrived) skips the heartbeat.
      const moved = new Set(fixes.map((fix) => fix.truckId));
      for (const position of await this.positions.latest()) {
        if (moved.has(position.truckId)) continue;
        fixes.push({ truckId: position.truckId, point: position.point, heading: position.heading, speedKmh: 0, recordedAt: now });
      }
    }

    if (fixes.length) await sink(fixes).catch((err) => this.logger.warn(`Could not store positions: ${err.message}`));
    await Promise.all(
      arrivals.map(async (updates) => {
        try {
          for (const update of updates) await update();
        } catch (err) {
          this.logger.warn(`Status update failed: ${(err as Error).message}`);
        }
      }),
    );
  }

  /** Starts legs for trucks with a new current load and drops legs whose load changed. */
  async plan() {
    if (this.planning) return;
    this.planning = true;
    try {
      const trips = new Map((await this.trips.activeTrips()).map((trip) => [trip.truck.id, trip]));
      // Re-plan when the load changes, or when its pickup was confirmed since planning.
      for (const [truckId, leg] of this.legs) {
        const trip = trips.get(truckId);
        if (trip?.cargo.id !== leg.cargoId || !!trip.cargo.pickedUpAt !== leg.plannedPickedUp) this.legs.delete(truckId);
      }
      for (const [truckId, trip] of trips) {
        if (!this.legs.has(truckId)) this.legs.set(truckId, await this.legFor(trip));
      }
    } catch (err) {
      this.logger.warn(`Simulator planning failed: ${(err as Error).message}`);
    } finally {
      this.planning = false;
    }
  }

  private async legFor(trip: Trip): Promise<Leg> {
    // App drivers confirm each stop themselves, so the truck only drives to the next one.
    const stops = trip.driverUsesApp ? stopsOf(trip.cargo).slice(0, 1) : stopsOf(trip.cargo);
    const points: LngLat[] = [...(trip.position ? [trip.position.point] : []), ...stops.map((s) => s.point)];
    const needsPickup = stops[0].kind === "pickup" && !trip.driverUsesApp;
    const { path, pickupAtM } = await this.pathThrough(trip, points, needsPickup && !!trip.position);
    return {
      cargoId: trip.cargo.id,
      path,
      progressM: 0,
      speedKmh: CRUISE_KMH,
      // Without a known position the truck starts at the pickup.
      pickupAtM: needsPickup ? (pickupAtM ?? 0) : undefined,
      pickedUp: !needsPickup,
      done: false,
      plannedPickedUp: !!trip.cargo.pickedUpAt,
      driverConfirms: trip.driverUsesApp,
    };
  }

  // Real truck route when routing is available; straight lines otherwise, so the
  // simulator also works without a Mapbox token.
  private async pathThrough(trip: Trip, points: LngLat[], pickupIsSecondStop: boolean) {
    if (points.length < 2) return { path: new Path([points[0], points[0]]), pickupAtM: 0 };
    try {
      const [route] = await this.routing.route({ coordinates: points, vehicle: trip.truck, alternatives: false });
      if (route) {
        return { path: new Path(route.geometry.coordinates), pickupAtM: pickupIsSecondStop ? route.legs[0]?.distanceM : 0 };
      }
    } catch (err) {
      this.logger.warn(`Routing unavailable for ${trip.truck.truckNumber}, using straight lines: ${(err as Error).message}`);
    }
    const path = new Path(points);
    return { path, pickupAtM: pickupIsSecondStop ? path.cumulative[1] : 0 };
  }
}
