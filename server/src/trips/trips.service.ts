import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, eq, isNotNull, isNull, notInArray, sql, SQL } from "drizzle-orm";
import { Cargo } from "../cargos/cargos.service";
import { FINISHED_STATUSES } from "../common/cargo-status";
import { Database } from "../db/client";
import { DB } from "../db/db.module";
import { cargos, drivers, trailers, trucks } from "../db/schema";
import { PositionsService } from "../positions/positions.service";
import { LngLat, RoutePlan, RoutingService } from "../routing/routing.types";
import { TruckPosition } from "../telematics/telematics.types";
import { TripRouteCache } from "./trip-route-cache";

type Truck = typeof trucks.$inferSelect;

export interface Stop {
  kind: "pickup" | "delivery";
  point: LngLat;
  name: string;
  cargoId: string;
}

/** What one truck is doing: its current load, the loads queued after it, and where it heads next. */
export interface Trip {
  truck: Truck;
  cargo: Cargo;
  queue: Cargo[];
  position?: TruckPosition;
  nextStop: Stop;
  /** The current load's driver has a driver-app login and confirms pickup/delivery there. */
  driverUsesApp: boolean;
}

const lngLat = (point: { x: number; y: number }): LngLat => [point.x, point.y];

/** Remaining stops of a load: pickup (unless already picked up), then delivery. */
export const stopsOf = (cargo: Cargo): Stop[] => [
  ...(cargo.pickedUpAt
    ? []
    : [{ kind: "pickup" as const, point: lngLat(cargo.pickupPoint!), name: cargo.pickupLocation, cargoId: cargo.id }]),
  { kind: "delivery", point: lngLat(cargo.deliveryPoint!), name: cargo.deliveryLocation, cargoId: cargo.id },
];

const NEXT_PICKUP_CANDIDATES = 5;
// Trucks don't run empty across oceans for a next load; also keeps the matrix routable.
const DEFAULT_NEXT_PICKUP_MAX_KM = 1500;

@Injectable()
export class TripsService {
  private readonly nextPickupMaxM: number;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly positions: PositionsService,
    private readonly routing: RoutingService,
    private readonly routes: TripRouteCache,
    config: ConfigService,
  ) {
    this.nextPickupMaxM = Number(config.get("NEXT_PICKUP_MAX_KM") ?? DEFAULT_NEXT_PICKUP_MAX_KM) * 1000;
  }

  /**
   * Active trips, one per truck. A truck's loads are worked in order: the one already
   * picked up first, then by pickup date. Loads without coordinates are skipped.
   */
  async activeTrips(filter: { truckId?: string; driverId?: string } = {}): Promise<Trip[]> {
    const conditions: SQL[] = [
      isNotNull(cargos.truckId),
      isNotNull(cargos.pickupPoint),
      isNotNull(cargos.deliveryPoint),
      notInArray(cargos.status, FINISHED_STATUSES),
    ];
    if (filter.truckId) conditions.push(eq(cargos.truckId, filter.truckId));
    if (filter.driverId) conditions.push(eq(cargos.driverId, filter.driverId));

    const rows = await this.db
      .select({ cargo: cargos, truck: trucks, driverUserId: drivers.userId })
      .from(cargos)
      .innerJoin(trucks, eq(trucks.id, cargos.truckId))
      .leftJoin(drivers, eq(drivers.id, cargos.driverId))
      .where(and(...conditions))
      .orderBy(sql`${cargos.pickedUpAt} is null`, asc(cargos.pickupDate), asc(cargos.createdAt));

    const byTruck = new Map<string, { truck: Truck; loads: Cargo[]; usesApp: boolean[] }>();
    for (const { cargo, truck, driverUserId } of rows) {
      const entry = byTruck.get(truck.id) ?? { truck, loads: [], usesApp: [] };
      entry.loads.push(cargo);
      entry.usesApp.push(!!driverUserId);
      byTruck.set(truck.id, entry);
    }

    const latest = new Map((await this.positions.latest()).map((p) => [p.truckId, p]));
    return [...byTruck.values()].map(({ truck, loads: [cargo, ...queue], usesApp }) => ({
      truck,
      cargo,
      queue,
      position: latest.get(truck.id),
      nextStop: stopsOf(cargo)[0],
      driverUsesApp: usesApp[0],
    }));
  }

  /** The trailer coupled for a load, so the driver knows which one to pick up. */
  async trailerFor(cargo: Cargo) {
    if (!cargo.trailerId) return null;
    const trailer = await this.db.query.trailers.findFirst({ where: eq(trailers.id, cargo.trailerId) });
    return trailer ? { id: trailer.id, trailerNumber: trailer.trailerNumber, trailer: trailer.trailer } : null;
  }

  /** Truck-aware route from the truck's position through the current load's remaining stops. */
  async routeFor(trip: Trip, options: { includeQueue?: boolean } = {}): Promise<RoutePlan | null> {
    const loads = options.includeQueue ? [trip.cargo, ...trip.queue] : [trip.cargo];
    const stops = loads.flatMap(stopsOf).map((stop) => stop.point);
    const coordinates = trip.position ? [trip.position.point, ...stops] : stops;
    if (coordinates.length < 2) return null;
    const { truck } = trip;
    // A new route is needed when the stops, the vehicle or whether it starts at the truck change.
    const signature = JSON.stringify([
      loads.map((load) => load.id),
      stops,
      !!trip.position,
      [truck.heightM, truck.widthM, truck.weightT, truck.lengthM, truck.axles],
    ]);
    const key = `${truck.id}:${options.includeQueue ? "queue" : "current"}`;
    return this.routes.get(key, truck.id, signature, trip.position, async () => {
      const [plan] = await this.routing.route({ coordinates: coordinates.slice(0, 25), vehicle: truck, alternatives: false });
      return plan ?? null;
    });
  }

  /** Drops cached routes of trucks without an active trip. */
  retainRoutes(trips: Trip[]) {
    this.routes.retain(trips.map((trip) => trip.truck.id));
  }

  /**
   * Unassigned loads ranked by drive time to their pickup, starting where the truck will
   * be free: after its current loads, or from where it is now when it has none.
   */
  async nextPickups(truckId: string) {
    const truck = await this.db.query.trucks.findFirst({ where: eq(trucks.id, truckId) });
    if (!truck) throw new NotFoundException("Truck not found");

    const [trip] = await this.activeTrips({ truckId });
    let origin: LngLat;
    let availableAt = new Date();
    let after: "current-position" | "current-loads";
    if (trip) {
      const last = trip.queue[trip.queue.length - 1] ?? trip.cargo;
      origin = lngLat(last.deliveryPoint!);
      const remaining = await this.routeFor(trip, { includeQueue: true });
      availableAt = new Date(Date.now() + (remaining?.durationS ?? 0) * 1000);
      after = "current-loads";
    } else {
      const position = await this.positions.latestFor(truckId);
      if (!position) throw new UnprocessableEntityException("Truck has no known position yet");
      origin = position.point;
      after = "current-position";
    }

    // Closest pickups as the crow flies, then real drive times for those.
    const originSql = sql`ST_SetSRID(ST_MakePoint(${origin[0]}, ${origin[1]}), 4326)::geography`;
    const candidates = await this.db
      .select()
      .from(cargos)
      .where(
        and(
          isNull(cargos.truckId),
          isNotNull(cargos.pickupPoint),
          notInArray(cargos.status, FINISHED_STATUSES),
          sql`ST_DWithin(${cargos.pickupPoint}::geography, ${originSql}, ${this.nextPickupMaxM})`,
        ),
      )
      .orderBy(sql`ST_Distance(${cargos.pickupPoint}::geography, ${originSql})`)
      .limit(Math.min(NEXT_PICKUP_CANDIDATES, this.routing.maxMatrixDestinations));

    const times = await this.routing.travelTimes(origin, candidates.map((c) => lngLat(c.pickupPoint!)), truck);
    const ranked = candidates
      .map((cargo, i) => {
        const { durationS, distanceM } = times[i];
        const arrivalAt = durationS === null ? null : new Date(availableAt.getTime() + durationS * 1000);
        return {
          cargo,
          durationS,
          distanceM,
          arrivalAt: arrivalAt?.toISOString() ?? null,
          // Pickup dates are calendar days; arriving any time that day counts as on time.
          onTime: arrivalAt && cargo.pickupDate ? arrivalAt.toISOString().slice(0, 10) <= cargo.pickupDate : null,
        };
      })
      .sort((a, b) => (a.durationS ?? Infinity) - (b.durationS ?? Infinity));

    return {
      origin: { point: origin, after, availableAt: availableAt.toISOString() },
      maxDistanceKm: this.nextPickupMaxM / 1000,
      candidates: ranked,
    };
  }
}
