import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { ResourceStatus } from "../common/assignable";
import { Database } from "../db/client";
import { DB } from "../db/db.module";
import { trailers } from "../db/schema";
import { CreateTrailerDto, UpdateTrailerDto } from "./trailers.dto";

@Injectable()
export class TrailersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  findAll(status?: ResourceStatus) {
    return this.db
      .select()
      .from(trailers)
      .where(status ? eq(trailers.status, status) : undefined)
      .orderBy(asc(trailers.trailerNumber));
  }

  async findOne(id: string) {
    const trailer = await this.db.query.trailers.findFirst({ where: eq(trailers.id, id) });
    if (!trailer) throw new NotFoundException("Trailer not found");
    return trailer;
  }

  async create(dto: CreateTrailerDto) {
    const [trailer] = await this.db.insert(trailers).values(dto).returning();
    return trailer;
  }

  async update(id: string, dto: UpdateTrailerDto) {
    const [trailer] = await this.db.update(trailers).set(dto).where(eq(trailers.id, id)).returning();
    if (!trailer) throw new NotFoundException("Trailer not found");
    return trailer;
  }

  async remove(id: string) {
    const [trailer] = await this.db.delete(trailers).where(eq(trailers.id, id)).returning({ id: trailers.id });
    if (!trailer) throw new NotFoundException("Trailer not found");
  }
}
