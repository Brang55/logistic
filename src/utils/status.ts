// Mirrors the API's status values (server/src/common/cargo-status.ts and assignable.ts).
export type CargoStatus = "new" | "edited" | "confirmed" | "picked_up" | "delivered" | "cancelled";
export type ResourceStatus = "available" | "taken";

const FINISHED: CargoStatus[] = ["delivered", "cancelled"];

/** Delivered or cancelled cargo no longer holds its driver, truck or trailer. */
export const isFinished = (status: CargoStatus) => FINISHED.includes(status);
