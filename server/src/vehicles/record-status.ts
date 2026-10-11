/** Warn this many days before a document expires or a check falls due. */
export const WARN_DAYS = 30;
/** Warn this many km (1,250 mi) before a distance-based check falls due. */
export const WARN_KM = 2012;

const DAY_MS = 86_400_000;

/** Today as YYYY-MM-DD (UTC), the format used for record dates. */
export const today = () => new Date().toISOString().slice(0, 10);

const toUtc = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);

export const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

export const addDays = (isoDate: string, days: number) => new Date(toUtc(isoDate) + days * DAY_MS).toISOString().slice(0, 10);

export type DocumentStatus = "expired" | "expiring" | "valid" | "no_expiry";

export function documentStatus(expiresOn: string | null, on = today()): { status: DocumentStatus; daysLeft: number | null } {
  if (!expiresOn) return { status: "no_expiry", daysLeft: null };
  const daysLeft = daysBetween(on, expiresOn);
  return { status: daysLeft < 0 ? "expired" : daysLeft <= WARN_DAYS ? "expiring" : "valid", daysLeft };
}

export type MaintenanceStatus = "overdue" | "due_soon" | "ok" | "not_started";

export interface MaintenanceDue {
  status: MaintenanceStatus;
  nextDueOn: string | null;
  nextDueKm: number | null;
  daysLeft: number | null;
  kmLeft: number | null;
}

/**
 * When a recurring check is next due, by date and/or distance; whichever comes first
 * decides the status. Never done yet means there is nothing to count from.
 */
export function maintenanceDue(
  item: { intervalDays: number | null; intervalKm: number | null; lastDoneOn: string | null; lastDoneKm: number | null },
  odometerKm: number | null,
  on = today(),
): MaintenanceDue {
  const nextDueOn = item.intervalDays && item.lastDoneOn ? addDays(item.lastDoneOn, item.intervalDays) : null;
  const nextDueKm = item.intervalKm && item.lastDoneKm !== null ? item.lastDoneKm + item.intervalKm : null;
  const daysLeft = nextDueOn ? daysBetween(on, nextDueOn) : null;
  const kmLeft = nextDueKm !== null && odometerKm !== null ? nextDueKm - odometerKm : null;

  if (nextDueOn === null && nextDueKm === null) {
    return { status: "not_started", nextDueOn, nextDueKm, daysLeft, kmLeft };
  }
  const overdue = (daysLeft !== null && daysLeft < 0) || (kmLeft !== null && kmLeft < 0);
  const soon = (daysLeft !== null && daysLeft <= WARN_DAYS) || (kmLeft !== null && kmLeft <= WARN_KM);
  return { status: overdue ? "overdue" : soon ? "due_soon" : "ok", nextDueOn, nextDueKm, daysLeft, kmLeft };
}
