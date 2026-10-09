import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { Database } from "../db/client";
import { DB } from "../db/db.module";
import { positions, trucks } from "../db/schema";
import { PositionFix, TruckPosition } from "./telematics.types";

type PositionRow = typeof positions.$inferSelect;

const toTruckPosition = (row: Pick<PositionRow, "truckId" | "point" | "speedKmh" | "heading" | "recordedAt">): TruckPosition => ({
  truckId: row.truckId,
  point: [row.point.x, row.point.y],
  speedKmh: row.speedKmh,
  heading: row.heading,
  recordedAt: row.recordedAt.toISOString(),
});

@Injectable()
export class PositionsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Stores fixes and returns how many were stored, the newest position per truck,
   * and the vehicle ids that matched no truck.
   */
  async record(fixes: PositionFix[], source: string) {
    const truckIds = await this.resolveTrucks(fixes);
    const rows = fixes.flatMap((fix) => {
      const truckId = fix.truckId ?? (fix.vehicleId ? truckIds.get(fix.vehicleId) : undefined);
      if (!truckId) return [];
      return [
        {
          truckId,
          point: { x: fix.point[0], y: fix.point[1] },
          speedKmh: fix.speedKmh ?? null,
          heading: fix.heading ?? null,
          recordedAt: fix.recordedAt ?? new Date(),
          source,
        },
      ];
    });
    const unknownVehicles = [...new Set(fixes.filter((f) => !f.truckId && !truckIds.has(f.vehicleId ?? "")).map((f) => f.vehicleId ?? ""))];
    if (!rows.length) return { stored: 0, latest: [], unknownVehicles };

    await this.db.insert(positions).values(rows);

    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const current = latest.get(row.truckId);
      if (!current || row.recordedAt > current.recordedAt) latest.set(row.truckId, row);
    }
    return { stored: rows.length, latest: [...latest.values()].map(toTruckPosition), unknownVehicles };
  }

  /** The most recent position of every truck that has one. */
  async latest(): Promise<TruckPosition[]> {
    const rows = await this.db
      .selectDistinctOn([positions.truckId], {
        truckId: positions.truckId,
        point: positions.point,
        speedKmh: positions.speedKmh,
        heading: positions.heading,
        recordedAt: positions.recordedAt,
      })
      .from(positions)
      .orderBy(positions.truckId, sql`${positions.recordedAt} desc`);
    return rows.map(toTruckPosition);
  }

  async latestFor(truckId: string): Promise<TruckPosition | undefined> {
    const row = await this.db.query.positions.findFirst({
      where: eq(positions.truckId, truckId),
      orderBy: sql`${positions.recordedAt} desc`,
    });
    return row && toTruckPosition(row);
  }

  /** Track of one truck since a given time, oldest first. */
  async history(truckId: string, since: Date, limit: number): Promise<TruckPosition[]> {
    // Take the newest `limit` fixes, then return them in chronological order.
    const rows = await this.db
      .select()
      .from(positions)
      .where(and(eq(positions.truckId, truckId), gte(positions.recordedAt, since)))
      .orderBy(sql`${positions.recordedAt} desc`)
      .limit(limit);
    return rows.reverse().map(toTruckPosition);
  }

  private async resolveTrucks(fixes: PositionFix[]): Promise<Map<string, string>> {
    const vehicleIds = [...new Set(fixes.filter((f) => !f.truckId && f.vehicleId).map((f) => f.vehicleId!))];
    if (!vehicleIds.length) return new Map();
    const found = await this.db
      .select({ id: trucks.id, telematicsId: trucks.telematicsId, truckNumber: trucks.truckNumber })
      .from(trucks)
      .where(or(inArray(trucks.telematicsId, vehicleIds), inArray(trucks.truckNumber, vehicleIds)))
      .orderBy(asc(trucks.truckNumber));
    const byVehicle = new Map<string, string>();
    // Truck numbers first, so an explicit telematics id wins when both match.
    for (const truck of found) byVehicle.set(truck.truckNumber, truck.id);
    for (const truck of found) if (truck.telematicsId) byVehicle.set(truck.telematicsId, truck.id);
    return byVehicle;
  }
}
