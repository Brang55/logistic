import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { and, asc, eq, getTableColumns, isNull, notInArray, SQL } from "drizzle-orm";
import { nullIfEmpty, ResourceStatus } from "../common/assignable";
import { syncAssignment, Tx } from "../common/assignment";
import { FINISHED_STATUSES } from "../common/cargo-status";
import { Database } from "../db/client";
import { DB } from "../db/db.module";
import { cargos, drivers, trucks } from "../db/schema";
import { LiveGateway } from "../live/live.gateway";
import { CreateDriverDto, UpdateDriverDto } from "./drivers.dto";

// A driver with the truck they are seated in, if any.
const driverView = { ...getTableColumns(drivers), truckId: trucks.id, truckNumber: trucks.truckNumber };
export type DriverView = typeof drivers.$inferSelect & { truckId: string | null; truckNumber: string | null };

@Injectable()
export class DriversService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly auth: AuthService,
    private readonly live: LiveGateway,
  ) {}

  private select(where?: SQL) {
    return this.db.select(driverView).from(drivers).leftJoin(trucks, eq(trucks.driverId, drivers.id)).where(where);
  }

  /** The driver profile linked to a login with the driver role. */
  async findByUserId(userId: string): Promise<DriverView> {
    const [driver] = await this.select(eq(drivers.userId, userId));
    if (!driver) throw new ForbiddenException("No driver profile is linked to this account");
    return driver;
  }

  /** Creates a driver-app login for this driver, using their email address. */
  async createAccount(id: string, password: string) {
    const driver = await this.findOne(id);
    if (driver.userId) throw new ConflictException("This driver already has a login");
    const user = await this.auth.register(driver.truckDriverEmail, password, "driver");
    await this.db.update(drivers).set({ userId: user.id }).where(eq(drivers.id, id));
    return user;
  }

  findAll(status?: ResourceStatus): Promise<DriverView[]> {
    return this.select(status ? eq(drivers.status, status) : undefined).orderBy(asc(drivers.lastName), asc(drivers.firstName));
  }

  async emailExists(email: string) {
    const driver = await this.db.query.drivers.findFirst({
      where: eq(drivers.truckDriverEmail, email),
      columns: { id: true },
    });
    return !!driver;
  }

  async findOne(id: string): Promise<DriverView> {
    const [driver] = await this.select(eq(drivers.id, id));
    if (!driver) throw new NotFoundException("Driver not found");
    return driver;
  }

  async create({ truckId, ...dto }: CreateDriverDto) {
    const { id, moved } = await this.db.transaction(async (tx) => {
      const [driver] = await tx.insert(drivers).values(dto).returning({ id: drivers.id });
      return { id: driver.id, moved: truckId ? await seat(tx, driver.id, truckId) : [] };
    });
    moved.forEach((cargoId) => this.live.cargoChanged(cargoId));
    return this.findOne(id);
  }

  async update(id: string, { truckId, ...dto }: UpdateDriverDto) {
    const moved = await this.db.transaction(async (tx) => {
      const [driver] = Object.keys(dto).length
        ? await tx.update(drivers).set(dto).where(eq(drivers.id, id)).returning({ id: drivers.id })
        : await tx.select({ id: drivers.id }).from(drivers).where(eq(drivers.id, id));
      if (!driver) throw new NotFoundException("Driver not found");
      return truckId === undefined ? [] : seat(tx, id, nullIfEmpty(truckId));
    });
    moved.forEach((cargoId) => this.live.cargoChanged(cargoId));
    return this.findOne(id);
  }

  async remove(id: string) {
    const [driver] = await this.db.delete(drivers).where(eq(drivers.id, id)).returning({ id: drivers.id });
    if (!driver) throw new NotFoundException("Driver not found");
  }
}

/**
 * Seats the driver in a truck, or takes them out of theirs. Unfinished loads follow their truck:
 * the new truck's loads move from its previous driver to this one, and the loads this driver had
 * on their previous truck are left without a driver. A relief driver on a single load keeps it.
 * Returns the ids of the loads that changed driver.
 */
async function seat(tx: Tx, driverId: string, truckId: string | null): Promise<string[]> {
  const unfinishedOn = (truck: string, driver: string | null) =>
    and(
      eq(cargos.truckId, truck),
      driver ? eq(cargos.driverId, driver) : isNull(cargos.driverId),
      notInArray(cargos.status, FINISHED_STATUSES),
    );
  const [previous] = await tx.select({ id: trucks.id }).from(trucks).where(eq(trucks.driverId, driverId)).for("update");
  if (previous?.id === truckId) return [];

  const moved: { id: string }[] = [];
  if (previous) {
    await tx.update(trucks).set({ driverId: null }).where(eq(trucks.id, previous.id));
    moved.push(...(await tx.update(cargos).set({ driverId: null }).where(unfinishedOn(previous.id, driverId)).returning({ id: cargos.id })));
  }
  let replaced: string | null = null;
  if (truckId) {
    const [truck] = await tx.select({ driverId: trucks.driverId }).from(trucks).where(eq(trucks.id, truckId)).for("update");
    if (!truck) throw new NotFoundException("Truck not found");
    replaced = truck.driverId;
    await tx.update(trucks).set({ driverId }).where(eq(trucks.id, truckId));
    moved.push(...(await tx.update(cargos).set({ driverId }).where(unfinishedOn(truckId, replaced)).returning({ id: cargos.id })));
  }
  await syncAssignment(tx, { driverId }, { driverId: replaced });
  return moved.map((cargo) => cargo.id);
}
