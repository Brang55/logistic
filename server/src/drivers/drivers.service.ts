import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { asc, eq } from "drizzle-orm";
import { Database } from "../db/client";
import { DB } from "../db/db.module";
import { drivers } from "../db/schema";
import { CreateDriverDto, UpdateDriverDto } from "./drivers.dto";

@Injectable()
export class DriversService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly auth: AuthService,
  ) {}

  /** The driver profile linked to a login with the driver role. */
  async findByUserId(userId: string) {
    const driver = await this.db.query.drivers.findFirst({ where: eq(drivers.userId, userId) });
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

  findAll(status?: string) {
    return this.db
      .select()
      .from(drivers)
      .where(status ? eq(drivers.status, status) : undefined)
      .orderBy(asc(drivers.lastName), asc(drivers.firstName));
  }

  async emailExists(email: string) {
    const driver = await this.db.query.drivers.findFirst({
      where: eq(drivers.truckDriverEmail, email),
      columns: { id: true },
    });
    return !!driver;
  }

  async findOne(id: string) {
    const driver = await this.db.query.drivers.findFirst({ where: eq(drivers.id, id) });
    if (!driver) throw new NotFoundException("Driver not found");
    return driver;
  }

  async create(dto: CreateDriverDto) {
    const [driver] = await this.db.insert(drivers).values(dto).returning();
    return driver;
  }

  async update(id: string, dto: UpdateDriverDto) {
    const [driver] = await this.db.update(drivers).set(dto).where(eq(drivers.id, id)).returning();
    if (!driver) throw new NotFoundException("Driver not found");
    return driver;
  }

  async remove(id: string) {
    const [driver] = await this.db.delete(drivers).where(eq(drivers.id, id)).returning({ id: drivers.id });
    if (!driver) throw new NotFoundException("Driver not found");
  }
}
