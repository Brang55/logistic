import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, ne } from "drizzle-orm";
import { nullIfEmpty, ResourceStatus } from "../common/assignable";
import { Tx } from "../common/assignment";
import { Database } from "../db/client";
import { DB } from "../db/db.module";
import { trucks } from "../db/schema";
import { CreateTruckDto, UpdateTruckDto } from "./trucks.dto";

@Injectable()
export class TrucksService {
  constructor(@Inject(DB) private readonly db: Database) {}

  findAll(status?: ResourceStatus) {
    return this.db
      .select()
      .from(trucks)
      .where(status ? eq(trucks.status, status) : undefined)
      .orderBy(asc(trucks.truckNumber));
  }

  async findOne(id: string) {
    const truck = await this.db.query.trucks.findFirst({ where: eq(trucks.id, id) });
    if (!truck) throw new NotFoundException("Truck not found");
    return truck;
  }

  create(dto: CreateTruckDto) {
    return this.db.transaction(async (tx) => {
      const changes = await hookTrailer(tx, dto);
      const [truck] = await tx.insert(trucks).values(changes).returning();
      return truck;
    });
  }

  update(id: string, dto: UpdateTruckDto) {
    return this.db.transaction(async (tx) => {
      const changes = await hookTrailer(tx, dto, id);
      const [truck] = await tx.update(trucks).set(changes).where(eq(trucks.id, id)).returning();
      if (!truck) throw new NotFoundException("Truck not found");
      return truck;
    });
  }

  async remove(id: string) {
    const [truck] = await this.db.delete(trucks).where(eq(trucks.id, id)).returning({ id: trucks.id });
    if (!truck) throw new NotFoundException("Truck not found");
  }
}

// A trailer is hooked to one truck at a time: hooking it to this truck unhooks it from the other.
async function hookTrailer<T extends UpdateTruckDto>(tx: Tx, dto: T, truckId?: string) {
  if (!("trailerId" in dto)) return dto;
  const trailerId = nullIfEmpty(dto.trailerId);
  if (trailerId) {
    await tx
      .update(trucks)
      .set({ trailerId: null })
      .where(and(eq(trucks.trailerId, trailerId), truckId ? ne(trucks.id, truckId) : undefined));
  }
  return { ...dto, trailerId };
}
