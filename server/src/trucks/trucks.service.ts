import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { Database } from "../db/client";
import { DB } from "../db/db.module";
import { trucks } from "../db/schema";
import { CreateTruckDto, UpdateTruckDto } from "./trucks.dto";

@Injectable()
export class TrucksService {
  constructor(@Inject(DB) private readonly db: Database) {}

  findAll(status?: string) {
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

  async create(dto: CreateTruckDto) {
    const [truck] = await this.db.insert(trucks).values(dto).returning();
    return truck;
  }

  async update(id: string, dto: UpdateTruckDto) {
    const [truck] = await this.db.update(trucks).set(dto).where(eq(trucks.id, id)).returning();
    if (!truck) throw new NotFoundException("Truck not found");
    return truck;
  }

  async remove(id: string) {
    const [truck] = await this.db.delete(trucks).where(eq(trucks.id, id)).returning({ id: trucks.id });
    if (!truck) throw new NotFoundException("Truck not found");
  }
}
