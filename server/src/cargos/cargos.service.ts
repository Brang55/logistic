import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import { AuthUser } from "../auth/auth-user";
import { AVAILABLE, nullIfEmpty, ResourceStatus, TAKEN } from "../common/assignable";
import { CargoStatus, FINISHED_STATUSES, PLANNING_STATUSES } from "../common/cargo-status";
import { Database } from "../db/client";
import { DB } from "../db/db.module";
import { cargos, drivers, trailers, trucks } from "../db/schema";
import { AlertsService } from "../live/alerts.service";
import { LiveGateway } from "../live/live.gateway";
import { GeocodingService } from "../mapbox/geocoding.service";
import { LngLat, RoutingService } from "../routing/routing.types";
import { TrucksService } from "../trucks/trucks.service";
import { AssignCargoDto, CreateCargoDto, UpdateCargoDto } from "./cargos.dto";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Cargo = typeof cargos.$inferSelect;

export interface CargoOrigin {
  source: string;
  externalId: string;
  pickupPoint: LngLat;
  deliveryPoint: LngLat;
}
type Assignment = Pick<Cargo, "driverId" | "truckId" | "trailerId">;
type RestrictionCheck = { truck: typeof trucks.$inferSelect; violations: string[] };
type Acceptance = Pick<Cargo, "restrictionsAcceptedAt" | "restrictionsAcceptedBy" | "restrictionsAcceptedTruckId">;
type Point = { x: number; y: number };

const toPoint = ([x, y]: LngLat): Point => ({ x, y });
const toLngLat = ({ x, y }: Point): LngLat => [x, y];

// Drizzle can't update a union of tables generically, so each resource gets its own setter.
const RESOURCES = [
  {
    key: "driverId",
    column: cargos.driverId,
    setStatus: (tx: Tx, id: string, status: ResourceStatus) =>
      tx.update(drivers).set({ status }).where(eq(drivers.id, id)),
  },
  {
    key: "truckId",
    column: cargos.truckId,
    setStatus: (tx: Tx, id: string, status: ResourceStatus) =>
      tx.update(trucks).set({ status }).where(eq(trucks.id, id)),
  },
  {
    key: "trailerId",
    column: cargos.trailerId,
    setStatus: (tx: Tx, id: string, status: ResourceStatus) =>
      tx.update(trailers).set({ status }).where(eq(trailers.id, id)),
  },
] as const;

@Injectable()
export class CargosService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly geocoding: GeocodingService,
    private readonly routing: RoutingService,
    private readonly trucks: TrucksService,
    private readonly live: LiveGateway,
    private readonly alerts: AlertsService,
  ) {}

  findAll(status?: CargoStatus) {
    return this.db
      .select()
      .from(cargos)
      .where(status ? eq(cargos.status, status) : undefined)
      // id breaks ties so rows created together keep a stable order.
      .orderBy(desc(cargos.createdAt), asc(cargos.id));
  }

  findBySource(source: string, externalIds: string[]) {
    if (!externalIds.length) return Promise.resolve([]);
    return this.db
      .select({ id: cargos.id, externalId: cargos.externalId, status: cargos.status })
      .from(cargos)
      .where(and(eq(cargos.source, source), inArray(cargos.externalId, externalIds)));
  }

  async findOne(id: string) {
    const cargo = await this.db.query.cargos.findFirst({ where: eq(cargos.id, id) });
    if (!cargo) throw new NotFoundException("Cargo not found");
    return cargo;
  }

  /**
   * `origin` marks cargo imported from a load board; its coordinates are already known,
   * so those addresses aren't geocoded again.
   */
  async create(dto: CreateCargoDto, origin?: CargoOrigin) {
    const points = origin
      ? { pickupPoint: toPoint(origin.pickupPoint), deliveryPoint: toPoint(origin.deliveryPoint) }
      : await this.locate(dto);
    const source = origin ? { source: origin.source, externalId: origin.externalId } : {};
    return this.db.transaction(async (tx) => {
      const [cargo] = await tx
        .insert(cargos)
        .values({ ...dto, ...normalizeRefs(dto), ...points, ...source, status: "new" })
        .returning();
      await syncAssignment(tx, emptyAssignment, cargo);
      return cargo;
    }).then(this.changed);
  }

  // Editing a cargo that hasn't left yet sends it back to "edited" so it has to be
  // confirmed again; loads already on the road keep their status.
  async update(id: string, dto: UpdateCargoDto) {
    const current = await this.findOne(id);
    const points = await this.locate(dto, current);
    const status = PLANNING_STATUSES.includes(current.status) ? "edited" : current.status;
    return this.save(id, { ...dto, ...points, status });
  }

  /**
   * Dispatcher assignment changes only the driver, truck and trailer, keeping the cargo's status.
   * A truck whose route breaks height or weight limits is refused unless the dispatcher
   * accepts the restrictions; the acceptance is recorded for that truck.
   */
  async assign(id: string, { acceptRestrictions, ...dto }: AssignCargoDto, user: AuthUser) {
    const current = await this.findOne(id);
    const truckId = "truckId" in dto ? nullIfEmpty(dto.truckId) : current.truckId;

    let acceptance: Partial<Acceptance> = {};
    let check: RestrictionCheck | undefined;
    if (!truckId) {
      acceptance = noAcceptance;
    } else if (truckId !== current.restrictionsAcceptedTruckId) {
      check = await this.restrictionsFor(id, truckId);
      if (check.violations.length && !acceptRestrictions) {
        throw new ConflictException({
          statusCode: 409,
          code: "ROUTE_RESTRICTIONS",
          message: `${check.truck.truckNumber}'s route to ${current.deliveryLocation} breaks truck restrictions`,
          violations: check.violations,
        });
      }
      acceptance = check.violations.length
        ? { restrictionsAcceptedAt: new Date(), restrictionsAcceptedBy: user.email, restrictionsAcceptedTruckId: truckId }
        : noAcceptance;
    }

    const cargo = await this.save(id, { ...dto, ...acceptance });
    if (check?.violations.length) {
      this.alerts.raise({
        kind: "route-restriction",
        severity: "warning",
        message: `${user.email} assigned ${check.truck.truckNumber} to ${cargo.pickupLocation} → ${cargo.deliveryLocation} despite ${check.violations.length} truck restriction${check.violations.length === 1 ? "" : "s"}: ${check.violations[0]}`,
        cargoId: cargo.id,
        truckId: check.truck.id,
      });
    }
    return cargo;
  }

  /**
   * Restriction violations on the route the dispatcher sees for this truck (the primary one).
   * A routing outage or an unlocatable address doesn't block the assignment.
   */
  private async restrictionsFor(id: string, truckId: string): Promise<RestrictionCheck> {
    const truck = await this.trucks.findOne(truckId);
    try {
      const { routes } = await this.route(id, { truckId });
      const notices = routes[0]?.notices ?? [];
      return { truck, violations: [...new Set(notices.filter((n) => n.type === "violation").map((n) => n.message))] };
    } catch (err) {
      if (err instanceof BadGatewayException || err instanceof UnprocessableEntityException) return { truck, violations: [] };
      throw err;
    }
  }

  private save(id: string, changes: UpdateCargoDto & Partial<Pick<Cargo, "status" | "pickupPoint" | "deliveryPoint"> & Acceptance>) {
    return this.db.transaction(async (tx) => {
      const current = await tx.query.cargos.findFirst({ where: eq(cargos.id, id) });
      if (!current) throw new NotFoundException("Cargo not found");
      const [cargo] = await tx
        .update(cargos)
        .set({ ...changes, ...normalizeRefs(changes) })
        .where(eq(cargos.id, id))
        .returning();
      await syncAssignment(tx, current, cargo);
      return cargo;
    }).then(this.changed);
  }

  /** Driver (or simulator) confirms the load is on the truck. */
  async markPickedUp(id: string) {
    const cargo = await this.findOne(id);
    if (cargo.pickedUpAt || FINISHED_STATUSES.includes(cargo.status)) {
      throw new ConflictException("Cargo was already picked up");
    }
    if (!cargo.truckId) throw new ConflictException("Cargo has no truck assigned");
    // Guarded again in the update so two confirmations at once can't both pick it up.
    const [updated] = await this.db
      .update(cargos)
      .set({ status: "picked_up", pickedUpAt: new Date() })
      .where(and(eq(cargos.id, id), isNull(cargos.pickedUpAt), inArray(cargos.status, PLANNING_STATUSES)))
      .returning();
    if (!updated) throw new ConflictException("Cargo was already picked up");
    return this.changed(updated);
  }

  /** Delivery frees the driver, truck and trailer unless another load is queued for them. */
  async markDelivered(id: string) {
    const cargo = await this.findOne(id);
    if (!cargo.pickedUpAt) throw new ConflictException("Cargo has not been picked up yet");
    if (FINISHED_STATUSES.includes(cargo.status)) throw new ConflictException("Cargo is already finished");
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(cargos)
        .set({ status: "delivered", deliveredAt: new Date() })
        .where(and(eq(cargos.id, id), isNotNull(cargos.pickedUpAt), notInArray(cargos.status, FINISHED_STATUSES)))
        .returning();
      if (!row) throw new ConflictException("Cargo is already finished");
      await syncAssignment(tx, cargo, emptyAssignment);
      return row;
    });
    return this.changed(updated);
  }

  async reportDelay(id: string, minutes: number, reason: string) {
    const [cargo] = await this.db
      .update(cargos)
      .set({ delayMinutes: minutes, delayReason: reason, delayReportedAt: new Date() })
      .where(eq(cargos.id, id))
      .returning();
    if (!cargo) throw new NotFoundException("Cargo not found");
    this.alerts.raise({
      kind: "delay-reported",
      severity: minutes >= 60 ? "critical" : "warning",
      message: `${cargo.pickedUpAt ? "Delivery to" : "Pickup at"} ${cargo.pickedUpAt ? cargo.deliveryLocation : cargo.pickupLocation} delayed by ${minutes} min${reason ? `: ${reason}` : ""}`,
      cargoId: cargo.id,
      truckId: cargo.truckId ?? undefined,
    });
    return this.changed(cargo);
  }

  // Lets dispatcher screens refresh; returns the cargo for chaining.
  private changed = (cargo: Cargo) => {
    this.live.cargoChanged(cargo.id);
    return cargo;
  };

  /**
   * Routes pickup → delivery (optionally starting from `from`, e.g. the truck's position,
   * skipping the pickup once the load is on board)
   * using the given truck's dimensions, or the assigned truck's when none is given.
   */
  async route(id: string, options: { truckId?: string; from?: LngLat }) {
    const cargo = await this.findOne(id);
    const { pickupPoint, deliveryPoint } = await this.ensureLocated(cargo);
    const truckId = options.truckId ?? cargo.truckId;
    const truck = truckId ? await this.trucks.findOne(truckId) : null;

    const pickup = toLngLat(pickupPoint);
    const delivery = toLngLat(deliveryPoint);
    // From the truck's position, a load already on board goes straight to delivery.
    const pickedUp = !!cargo.pickedUpAt;
    const coordinates = options.from ? [options.from, ...(pickedUp ? [] : [pickup]), delivery] : [pickup, delivery];
    const routes = await this.routing.route({ coordinates, vehicle: truck ?? undefined });
    return { pickup, delivery, pickedUp, truck, routes };
  }

  // Geocodes pickup/delivery text that is new or changed. Failures leave the point empty
  // so saving a cargo never depends on the geocoder being reachable.
  private async locate(dto: UpdateCargoDto, current?: Cargo) {
    const changed = (text: string | undefined, previous: string | undefined) =>
      text !== undefined && text !== previous ? text : undefined;
    const pickupText = changed(dto.pickupLocation, current?.pickupLocation);
    const deliveryText = changed(dto.deliveryLocation, current?.deliveryLocation);
    const [pickupPoint, deliveryPoint] = await Promise.all([
      pickupText === undefined ? undefined : this.geocodePoint(pickupText),
      deliveryText === undefined ? undefined : this.geocodePoint(deliveryText),
    ]);
    return {
      ...(pickupPoint !== undefined && { pickupPoint }),
      ...(deliveryPoint !== undefined && { deliveryPoint }),
    };
  }

  // Cargo saved while the geocoder was unreachable is geocoded on first use.
  private async ensureLocated(cargo: Cargo): Promise<{ pickupPoint: Point; deliveryPoint: Point }> {
    const pickupPoint = cargo.pickupPoint ?? (await this.geocodePoint(cargo.pickupLocation));
    const deliveryPoint = cargo.deliveryPoint ?? (await this.geocodePoint(cargo.deliveryLocation));
    if (pickupPoint !== cargo.pickupPoint || deliveryPoint !== cargo.deliveryPoint) {
      await this.db.update(cargos).set({ pickupPoint, deliveryPoint }).where(eq(cargos.id, cargo.id));
    }
    if (!pickupPoint) throw new UnprocessableEntityException(`Could not locate pickup "${cargo.pickupLocation}"`);
    if (!deliveryPoint) throw new UnprocessableEntityException(`Could not locate delivery "${cargo.deliveryLocation}"`);
    return { pickupPoint, deliveryPoint };
  }

  private async geocodePoint(text: string): Promise<Point | null> {
    const found = await this.geocoding.geocode(text);
    return found ? toPoint(found) : null;
  }

  // Only a load that hasn't left yet can be (re)confirmed.
  async confirm(id: string) {
    const [cargo] = await this.db
      .update(cargos)
      .set({ status: "confirmed" })
      .where(and(eq(cargos.id, id), inArray(cargos.status, PLANNING_STATUSES)))
      .returning();
    if (cargo) return this.changed(cargo);
    const current = await this.findOne(id);
    throw new ConflictException(`A ${current.status.replace("_", " ")} cargo can't be confirmed`);
  }

  // Deleting a cargo frees the driver, truck and trailer that were assigned to it.
  remove(id: string) {
    return this.db.transaction(async (tx) => {
      const [cargo] = await tx.delete(cargos).where(eq(cargos.id, id)).returning();
      if (!cargo) throw new NotFoundException("Cargo not found");
      await syncAssignment(tx, cargo, emptyAssignment);
      return cargo;
    }).then(this.changed);
  }
}

const emptyAssignment: Assignment = { driverId: null, truckId: null, trailerId: null };
const noAcceptance: Acceptance = { restrictionsAcceptedAt: null, restrictionsAcceptedBy: null, restrictionsAcceptedTruckId: null };

// Only touch the keys present in the request, so a partial update keeps existing assignments.
function normalizeRefs(dto: UpdateCargoDto): Partial<Assignment> {
  const refs: Partial<Assignment> = {};
  for (const { key } of RESOURCES) {
    if (key in dto) refs[key] = nullIfEmpty(dto[key]);
  }
  return refs;
}

// A resource is taken while any unfinished cargo references it. Recomputing (instead of
// toggling) keeps statuses right when one truck has several loads queued.
async function syncAssignment(tx: Tx, before: Assignment, after: Assignment) {
  for (const { key, column, setStatus } of RESOURCES) {
    for (const id of new Set([before[key], after[key]])) {
      if (!id) continue;
      const [{ active }] = await tx
        .select({ active: count() })
        .from(cargos)
        .where(and(eq(column, id), notInArray(cargos.status, FINISHED_STATUSES)));
      await setStatus(tx, id, active > 0 ? TAKEN : AVAILABLE);
    }
  }
}
