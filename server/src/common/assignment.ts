import { and, count, eq, notInArray } from "drizzle-orm";
import { Database } from "../db/client";
import { cargos, drivers, trailers, trucks } from "../db/schema";
import { AVAILABLE, ResourceStatus, TAKEN } from "./assignable";
import { FINISHED_STATUSES } from "./cargo-status";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Who and what a load is assigned to. */
export type Assignment = { driverId: string | null; truckId: string | null; trailerId: string | null };
export const emptyAssignment: Assignment = { driverId: null, truckId: null, trailerId: null };

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

/**
 * A resource is taken while any unfinished cargo references it. Recomputing (instead of
 * toggling) keeps statuses right when one truck has several loads queued. Pass the
 * assignment before and after a change; keys left out are not touched.
 */
export async function syncAssignment(tx: Tx, before: Partial<Assignment>, after: Partial<Assignment>) {
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
