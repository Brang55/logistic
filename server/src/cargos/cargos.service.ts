import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, asc, count, desc, eq, notInArray } from "drizzle-orm";
import { AVAILABLE, nullIfEmpty, TAKEN } from "../common/assignable";
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
type Assignment = Pick<Cargo, "driverId" | "truckId" | "trailerId">;
type Point = { x: number; y: number };

const toPoint = ([x, y]: LngLat): Point => ({ x, y });
const toLngLat = ({ x, y }: Point): LngLat => [x, y];

/** Cargo in these states no longer holds its driver, truck or trailer. */
export const FINISHED_STATUSES = ["delivered", "cancelled"];
const PLANNING_STATUSES = ["new", "confirmed", "edited"];

// Drizzle can't update a union of tables generically, so each resource gets its own setter.
const RESOURCES = [
  {
    key: "driverId",
    column: cargos.driverId,
    setStatus: (tx: Tx, id: string, status: string) =>
      tx.update(drivers).set({ status }).where(eq(drivers.id, id)),
  },
  {
    key: "truckId",
    column: cargos.truckId,
    setStatus: (tx: Tx, id: string, status: string) =>
      tx.update(trucks).set({ status }).where(eq(trucks.id, id)),
  },
  {
    key: "trailerId",
    column: cargos.trailerId,
    setStatus: (tx: Tx, id: string, status: string) =>
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

  findAll(status?: string) {
    return this.db
      .select()
      .from(cargos)
      .where(status ? eq(cargos.status, status) : undefined)
      // id breaks ties so rows created together keep a stable order.
      .orderBy(desc(cargos.createdAt), asc(cargos.id));
  }

  async findOne(id: string) {
    const cargo = await this.db.query.cargos.findFirst({ where: eq(cargos.id, id) });
    if (!cargo) throw new NotFoundException("Cargo not found");
    return cargo;
  }

  async create(dto: CreateCargoDto) {
    const points = await this.locate(dto);
    return this.db.transaction(async (tx) => {
      const [cargo] = await tx
        .insert(cargos)
        .values({ ...dto, ...normalizeRefs(dto), ...points, status: "new" })
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

  // Dispatcher assignment changes only the driver, truck and trailer, keeping the cargo's status.
  assign(id: string, dto: AssignCargoDto) {
    return this.save(id, dto);
  }

  private save(id: string, changes: UpdateCargoDto & Partial<Pick<Cargo, "status" | "pickupPoint" | "deliveryPoint">>) {
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
    const [updated] = await this.db
      .update(cargos)
      .set({ status: "picked_up", pickedUpAt: new Date() })
      .where(eq(cargos.id, id))
      .returning();
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
        .where(eq(cargos.id, id))
        .returning();
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
   * Routes pickup → delivery (optionally starting from `from`, e.g. the truck's position)
   * using the given truck's dimensions, or the assigned truck's when none is given.
   */
  async route(id: string, options: { truckId?: string; from?: LngLat }) {
    const cargo = await this.findOne(id);
    const { pickupPoint, deliveryPoint } = await this.ensureLocated(cargo);
    const truckId = options.truckId ?? cargo.truckId;
    const truck = truckId ? await this.trucks.findOne(truckId) : null;

    const pickup = toLngLat(pickupPoint);
    const delivery = toLngLat(deliveryPoint);
    const routes = await this.routing.route({
      coordinates: options.from ? [options.from, pickup, delivery] : [pickup, delivery],
      vehicle: truck ?? undefined,
    });
    return { pickup, delivery, truck, routes };
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

  async confirm(id: string) {
    const [cargo] = await this.db.update(cargos).set({ status: "confirmed" }).where(eq(cargos.id, id)).returning();
    if (!cargo) throw new NotFoundException("Cargo not found");
    return this.changed(cargo);
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
