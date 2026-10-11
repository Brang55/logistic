// A cargo's life: planned (new → confirmed, back to edited when changed), picked up, then finished.
export const CARGO_STATUSES = ["new", "edited", "confirmed", "picked_up", "delivered", "cancelled"] as const;
export type CargoStatus = (typeof CARGO_STATUSES)[number];

/** Cargo in these states no longer holds its driver, truck or trailer. */
export const FINISHED_STATUSES: CargoStatus[] = ["delivered", "cancelled"];
/** Not yet on the road: editing sends these back to "edited", and only these can be picked up. */
export const PLANNING_STATUSES: CargoStatus[] = ["new", "confirmed", "edited"];
