import { ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, asc, count, desc, eq, gt, lt, sql } from "drizzle-orm";
import { AuthUser } from "../auth/auth-user";
import { Database } from "../db/client";
import { DB } from "../db/db.module";
import { cargos, chatMessages, drivers, roadReports, trucks } from "../db/schema";
import { DriversService } from "../drivers/drivers.service";
import { LiveGateway } from "../live/live.gateway";
import { PositionsService } from "../positions/positions.service";
import { LngLat } from "../routing/routing.types";
import { TrafficService } from "../trips/traffic.service";
import { TripsService } from "../trips/trips.service";
import { ChatMessageDto, RoadReportDto } from "./community.dto";
import { REPORT_TYPES, ReportType } from "./report-types";

type Driver = typeof drivers.$inferSelect;

// The same driver tapping the same report again nearby within this window updates it instead.
const DUPLICATE_RADIUS_M = 300;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const MESSAGE_PAGE = 100;
const HISTORY_LIMIT = 200;

const reportColumns = {
  id: roadReports.id,
  type: roadReports.type,
  point: roadReports.point,
  note: roadReports.note,
  createdAt: roadReports.createdAt,
  expiresAt: roadReports.expiresAt,
};

const reporterColumns = {
  driverId: drivers.id,
  firstName: drivers.firstName,
  lastName: drivers.lastName,
  truckNumber: trucks.truckNumber,
};

const senderColumns = {
  driverId: drivers.id,
  firstName: drivers.firstName,
  lastName: drivers.lastName,
  phoneNumber: drivers.phoneNumber,
  truckNumber: drivers.truckNumber,
};

const reportView = (row: {
  id: string;
  type: string;
  point: { x: number; y: number };
  note: string;
  createdAt: Date;
  expiresAt: Date;
  driverId: string;
  firstName: string;
  lastName: string;
  truckNumber: string | null;
}) => ({
  id: row.id,
  type: row.type,
  label: REPORT_TYPES[row.type as ReportType]?.label ?? row.type,
  point: [row.point.x, row.point.y] as LngLat,
  note: row.note,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
  reporter: { driverId: row.driverId, name: `${row.firstName} ${row.lastName}`, truckNumber: row.truckNumber },
});

@Injectable()
export class CommunityService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly drivers: DriversService,
    private readonly trips: TripsService,
    private readonly traffic: TrafficService,
    private readonly positions: PositionsService,
    private readonly live: LiveGateway,
  ) {}

  // ---- Road reports ----

  /** Active reports, plus where the asking driver's truck is so the app can show distances. */
  async listReports(user: AuthUser) {
    const rows = await this.db
      .select({ ...reportColumns, ...reporterColumns })
      .from(roadReports)
      .innerJoin(drivers, eq(drivers.id, roadReports.driverId))
      .leftJoin(trucks, eq(trucks.id, roadReports.truckId))
      .where(gt(roadReports.expiresAt, new Date()))
      .orderBy(desc(roadReports.createdAt));
    const position = user.role === "driver" ? await this.truckOf(await this.drivers.findByUserId(user.id)) : undefined;
    return { position: position?.point ?? null, reports: rows.map(reportView) };
  }

  /** Pins a report where the driver's truck last reported its position. */
  async createReport(user: AuthUser, dto: RoadReportDto) {
    const driver = await this.drivers.findByUserId(user.id);
    const truck = await this.truckOf(driver);
    if (!truck) throw new UnprocessableEntityException("Your truck's position isn't known yet, so the report can't be placed.");
    const [x, y] = truck.point;
    const expiresAt = new Date(Date.now() + REPORT_TYPES[dto.type].ttlHours * 3_600_000);

    const duplicate = await this.db.query.roadReports.findFirst({
      where: and(
        eq(roadReports.driverId, driver.id),
        eq(roadReports.type, dto.type),
        gt(roadReports.createdAt, new Date(Date.now() - DUPLICATE_WINDOW_MS)),
        sql`ST_DWithin(${roadReports.point}::geography, ST_SetSRID(ST_MakePoint(${x}, ${y}), 4326)::geography, ${DUPLICATE_RADIUS_M})`,
      ),
    });
    const values = { point: { x, y }, note: dto.note ?? "", truckId: truck.truckId, expiresAt };
    const [saved] = duplicate
      ? await this.db.update(roadReports).set(values).where(eq(roadReports.id, duplicate.id)).returning()
      : await this.db.insert(roadReports).values({ ...values, type: dto.type, driverId: driver.id }).returning();

    const report = await this.findReport(saved.id);
    this.live.roadReport(report);
    this.traffic.flagRoadReport({ ...report, createdAt: report.createdAt.toISOString() });
    return report;
  }

  /** Reporters can take back their own report (undo); dispatchers can remove any. */
  async removeReport(user: AuthUser, id: string) {
    const report = await this.db.query.roadReports.findFirst({ where: eq(roadReports.id, id) });
    if (!report) throw new NotFoundException("Report not found");
    if (user.role === "driver") {
      const driver = await this.drivers.findByUserId(user.id);
      if (report.driverId !== driver.id) throw new ForbiddenException("You can only remove your own reports");
    }
    await this.db.delete(roadReports).where(eq(roadReports.id, id));
    this.live.roadReport({ id, removed: true });
  }

  private async findReport(id: string) {
    const [row] = await this.db
      .select({ ...reportColumns, ...reporterColumns })
      .from(roadReports)
      .innerJoin(drivers, eq(drivers.id, roadReports.driverId))
      .leftJoin(trucks, eq(trucks.id, roadReports.truckId))
      .where(eq(roadReports.id, id));
    return reportView(row);
  }

  /** The truck the driver is on (their current load's, else the one on their profile) and its position. */
  private async truckOf(driver: Driver): Promise<{ truckId: string; point: LngLat } | undefined> {
    const [trip] = await this.trips.activeTrips({ driverId: driver.id });
    const truckId =
      trip?.truck.id ??
      (driver.truckNumber
        ? (await this.db.query.trucks.findFirst({ where: eq(trucks.truckNumber, driver.truckNumber) }))?.id
        : undefined);
    if (!truckId) return undefined;
    const position = trip?.position ?? (await this.positions.latestFor(truckId));
    return position && { truckId, point: position.point };
  }

  // ---- Delivery history ----

  async history(user: AuthUser) {
    const driver = await this.drivers.findByUserId(user.id);
    const delivered = and(eq(cargos.driverId, driver.id), eq(cargos.status, "delivered"));
    const [deliveries, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: cargos.id,
          pickupLocation: cargos.pickupLocation,
          deliveryLocation: cargos.deliveryLocation,
          descriptionOfGoods: cargos.descriptionOfGoods,
          weight: cargos.weight,
          quantity: cargos.quantity,
          shipperName: cargos.shipperName,
          receiverName: cargos.receiverName,
          deliveryDate: cargos.deliveryDate,
          pickedUpAt: cargos.pickedUpAt,
          deliveredAt: cargos.deliveredAt,
          delayMinutes: cargos.delayMinutes,
          truckNumber: trucks.truckNumber,
        })
        .from(cargos)
        .leftJoin(trucks, eq(trucks.id, cargos.truckId))
        .where(delivered)
        .orderBy(sql`${cargos.deliveredAt} desc nulls last`)
        .limit(HISTORY_LIMIT),
      this.db.select({ total: count() }).from(cargos).where(delivered),
    ]);
    return { total, deliveries };
  }

  // ---- Driver directory and chat ----

  async directory() {
    const rows = await this.db
      .select({
        id: drivers.id,
        firstName: drivers.firstName,
        lastName: drivers.lastName,
        phoneNumber: drivers.phoneNumber,
        truckNumber: drivers.truckNumber,
        status: drivers.status,
        userId: drivers.userId,
      })
      .from(drivers)
      .orderBy(asc(drivers.firstName), asc(drivers.lastName));
    return rows.map(({ userId, ...driver }) => ({ ...driver, usesApp: userId !== null }));
  }

  /** The latest messages, oldest first; `before` pages back through older ones. */
  async messages(before?: Date) {
    const rows = await this.db
      .select({
        id: chatMessages.id,
        body: chatMessages.body,
        createdAt: chatMessages.createdAt,
        ...senderColumns,
      })
      .from(chatMessages)
      .innerJoin(drivers, eq(drivers.id, chatMessages.driverId))
      .where(before ? lt(chatMessages.createdAt, before) : undefined)
      .orderBy(desc(chatMessages.createdAt))
      .limit(MESSAGE_PAGE);
    return rows.reverse().map(messageView);
  }

  async sendMessage(user: AuthUser, dto: ChatMessageDto) {
    const driver = await this.drivers.findByUserId(user.id);
    const [saved] = await this.db.insert(chatMessages).values({ driverId: driver.id, body: dto.body }).returning();
    const message = messageView({
      id: saved.id,
      body: saved.body,
      createdAt: saved.createdAt,
      driverId: driver.id,
      firstName: driver.firstName,
      lastName: driver.lastName,
      phoneNumber: driver.phoneNumber,
      truckNumber: driver.truckNumber,
    });
    this.live.chatMessage(message);
    return message;
  }
}

function messageView(row: {
  id: string;
  body: string;
  createdAt: Date;
  driverId: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  truckNumber: string;
}) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    sender: {
      driverId: row.driverId,
      name: `${row.firstName} ${row.lastName}`,
      phoneNumber: row.phoneNumber,
      truckNumber: row.truckNumber,
    },
  };
}
