import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, isNotNull, notInArray } from "drizzle-orm";
import { Database } from "../db/client";
import { DB } from "../db/db.module";
import { cargos } from "../db/schema";
import { LngLat, RoutingService } from "../routing/routing.types";
import { Path } from "./geo";
import { PositionsService } from "./positions.service";
import { PositionFix, PositionSink, TelematicsProvider } from "./telematics.types";

interface Trip {
  cargoId: string;
  path: Path;
  progressM: number;
  speedKmh: number;
  arrived: boolean;
}

// Cargo in these states is not driven by the simulator.
const INACTIVE_STATUSES = ["delivered", "cancelled"];
const CRUISE_KMH = 82;

/**
 * Demo telematics: every truck assigned to a cargo drives from its last known position
 * to the pickup and on to the delivery along a real truck route, at a configurable
 * time-lapse speed. Unassigned trucks stay where they are.
 */
@Injectable()
export class SimulatedTelematicsProvider extends TelematicsProvider {
  readonly name = "simulator";
  private readonly logger = new Logger(SimulatedTelematicsProvider.name);
  private readonly trips = new Map<string, Trip>();
  private timers: NodeJS.Timeout[] = [];
  private planning = false;

  private readonly tickMs: number;
  private readonly speedup: number;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly routing: RoutingService,
    private readonly positions: PositionsService,
    config: ConfigService,
  ) {
    super();
    this.tickMs = Number(config.get("SIMULATOR_TICK_MS") ?? 2000);
    this.speedup = Number(config.get("SIMULATOR_SPEEDUP") ?? 30);
  }

  start(sink: PositionSink) {
    this.logger.log(`Simulating assigned trucks every ${this.tickMs} ms at ${this.speedup}x speed`);
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

  /** Advances every trip by one tick and reports the new positions. */
  async tick(sink: PositionSink) {
    const fixes: PositionFix[] = [];
    const now = new Date();
    for (const [truckId, trip] of this.trips) {
      if (trip.arrived) continue;
      // Vary speed a little so the demo doesn't look robotic.
      trip.speedKmh = Math.min(90, Math.max(60, trip.speedKmh + (Math.random() - 0.5) * 6));
      trip.progressM += (trip.speedKmh / 3.6) * (this.tickMs / 1000) * this.speedup;
      trip.arrived = trip.progressM >= trip.path.lengthM;
      const { point, heading } = trip.path.at(trip.progressM);
      fixes.push({
        truckId,
        point,
        heading: Math.round(heading),
        speedKmh: trip.arrived ? 0 : Math.round(trip.speedKmh),
        recordedAt: now,
      });
    }
    if (fixes.length) await sink(fixes).catch((err) => this.logger.warn(`Could not store positions: ${err.message}`));
  }

  /** Starts trips for newly assigned trucks and drops trips whose assignment ended. */
  async plan() {
    if (this.planning) return;
    this.planning = true;
    try {
      const active = await this.db
        .select({
          cargoId: cargos.id,
          truckId: cargos.truckId,
          pickupPoint: cargos.pickupPoint,
          deliveryPoint: cargos.deliveryPoint,
        })
        .from(cargos)
        .where(
          and(
            isNotNull(cargos.truckId),
            isNotNull(cargos.pickupPoint),
            isNotNull(cargos.deliveryPoint),
            notInArray(cargos.status, INACTIVE_STATUSES),
          ),
        );

      const assigned = new Map(active.map((row) => [row.truckId!, row]));
      for (const [truckId, trip] of this.trips) {
        if (assigned.get(truckId)?.cargoId !== trip.cargoId) this.trips.delete(truckId);
      }

      for (const [truckId, cargo] of assigned) {
        if (this.trips.has(truckId)) continue;
        const pickup: LngLat = [cargo.pickupPoint!.x, cargo.pickupPoint!.y];
        const delivery: LngLat = [cargo.deliveryPoint!.x, cargo.deliveryPoint!.y];
        const current = (await this.positions.latestFor(truckId))?.point;
        const stops = current ? [current, pickup, delivery] : [pickup, delivery];
        this.trips.set(truckId, {
          cargoId: cargo.cargoId,
          path: await this.pathThrough(truckId, stops),
          progressM: 0,
          speedKmh: CRUISE_KMH,
          arrived: false,
        });
      }
    } catch (err) {
      this.logger.warn(`Simulator planning failed: ${(err as Error).message}`);
    } finally {
      this.planning = false;
    }
  }

  // Real truck route when routing is available; straight lines otherwise, so the
  // simulator also works without a Mapbox token.
  private async pathThrough(truckId: string, stops: LngLat[]): Promise<Path> {
    try {
      const truck = await this.db.query.trucks.findFirst({ where: (t, { eq }) => eq(t.id, truckId) });
      const [route] = await this.routing.route({ coordinates: stops, vehicle: truck ?? undefined, alternatives: false });
      if (route) return new Path(route.geometry.coordinates);
    } catch (err) {
      this.logger.warn(`Routing unavailable for simulated truck ${truckId}, using straight lines: ${(err as Error).message}`);
    }
    return new Path(stops);
  }
}

