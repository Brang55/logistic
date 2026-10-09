import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { AVAILABLE, nullIfEmpty, TAKEN } from "../common/assignable";
import { Database } from "../db/client";
import { DB } from "../db/db.module";
import { cargos, drivers, trailers, trucks } from "../db/schema";
import { CreateCargoDto, UpdateCargoDto } from "./cargos.dto";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Assignment = Pick<typeof cargos.$inferSelect, "driverId" | "truckId" | "trailerId">;

// Drizzle can't update a union of tables generically, so each resource gets its own setter.
const RESOURCES = [
  {
    key: "driverId",
    setStatus: (tx: Tx, id: string, status: string) =>
      tx.update(drivers).set({ status }).where(eq(drivers.id, id)),
  },
  {
    key: "truckId",
    setStatus: (tx: Tx, id: string, status: string) =>
      tx.update(trucks).set({ status }).where(eq(trucks.id, id)),
  },
  {
    key: "trailerId",
    setStatus: (tx: Tx, id: string, status: string) =>
      tx.update(trailers).set({ status }).where(eq(trailers.id, id)),
  },
] as const;

@Injectable()
export class CargosService {
  constructor(@Inject(DB) private readonly db: Database) {}

  findAll(status?: string) {
    return this.db
      .select()
      .from(cargos)
      .where(status ? eq(cargos.status, status) : undefined)
      .orderBy(desc(cargos.createdAt));
  }

  async findOne(id: string) {
    const cargo = await this.db.query.cargos.findFirst({ where: eq(cargos.id, id) });
    if (!cargo) throw new NotFoundException("Cargo not found");
    return cargo;
  }

  create(dto: CreateCargoDto) {
    return this.db.transaction(async (tx) => {
      const [cargo] = await tx
        .insert(cargos)
        .values({ ...dto, ...normalizeRefs(dto), status: "new" })
        .returning();
      await syncAssignment(tx, emptyAssignment, cargo);
      return cargo;
    });
  }

  // Any edit sends the cargo back to "edited" so it has to be confirmed again.
  update(id: string, dto: UpdateCargoDto) {
    return this.db.transaction(async (tx) => {
      const current = await tx.query.cargos.findFirst({ where: eq(cargos.id, id) });
      if (!current) throw new NotFoundException("Cargo not found");
      const [cargo] = await tx
        .update(cargos)
        .set({ ...dto, ...normalizeRefs(dto), status: "edited" })
        .where(eq(cargos.id, id))
        .returning();
      await syncAssignment(tx, current, cargo);
      return cargo;
    });
  }

  async confirm(id: string) {
    const [cargo] = await this.db.update(cargos).set({ status: "confirmed" }).where(eq(cargos.id, id)).returning();
    if (!cargo) throw new NotFoundException("Cargo not found");
    return cargo;
  }

  // Deleting a cargo frees the driver, truck and trailer that were assigned to it.
  remove(id: string) {
    return this.db.transaction(async (tx) => {
      const [cargo] = await tx.delete(cargos).where(eq(cargos.id, id)).returning();
      if (!cargo) throw new NotFoundException("Cargo not found");
      await syncAssignment(tx, cargo, emptyAssignment);
    });
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

async function syncAssignment(tx: Tx, before: Assignment, after: Assignment) {
  for (const { key, setStatus } of RESOURCES) {
    const [previous, next] = [before[key], after[key]];
    if (previous === next) continue;
    if (previous) await setStatus(tx, previous, AVAILABLE);
    if (next) await setStatus(tx, next, TAKEN);
  }
}
