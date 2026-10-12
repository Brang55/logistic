import type { AttentionItem, MaintenanceItem } from "../../app/api/vehicleRecords";
import type { Tone } from "../ui/helpers";
import { formatMiles } from "../../utils/units";

export const DOCUMENT_TYPES: Record<string, string> = {
  registration: "Registration",
  insurance: "Insurance",
  technical_inspection: "DOT inspection",
  tachograph: "Tachograph calibration",
  adr: "ADR certificate",
  cmr_insurance: "CMR insurance",
  road_tax: "Road tax / vignette",
  permit: "Permit",
  other: "Other",
};

// EU-only document types keep their labels for existing records but aren't offered for new ones.
const EU_DOCUMENT_TYPES = new Set(["tachograph", "adr", "cmr_insurance", "road_tax"]);
export const NEW_DOCUMENT_TYPES = Object.entries(DOCUMENT_TYPES).filter(([type]) => !EU_DOCUMENT_TYPES.has(type));

export const LOG_KINDS: Record<string, [string, Tone]> = {
  service: ["Service", "primary"],
  repair: ["Repair", "warning"],
  inspection: ["Inspection", "info"],
  damage: ["Damage", "danger"],
  note: ["Note", "neutral"],
};

export const CHECKLISTS = {
  trucks: [
    { value: "us-truck", label: "US truck (DOT inspection, oil, brakes, tyres, IFTA/IRP)" },
  ],
  trailers: [{ value: "trailer", label: "Trailer (inspection, brakes, tyres, lights)" }],
};

export const todayIso = () => new Date().toLocaleDateString("en-CA");

export const formatDate = (iso?: string | null) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
    : "–";

/** Odometer and service distances are stored in km and shown in miles. */
export const formatKm = (km?: number | null) => (km == null ? "–" : formatMiles(km));

export const formatMoney = (amount?: number | null, currency?: string | null) => {
  if (amount == null) return "";
  if (currency === "USD") return amount.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 2 });
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency ?? ""}`.trim();
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "in 12 days", "today", "3 days ago". */
export const relativeDays = (days: number) =>
  days === 0 ? "today" : days > 0 ? `in ${plural(days, "day")}` : `${plural(-days, "day")} ago`;

/** "Every year", "Every 6 months or 25,000 mi". */
export const intervalText = (days: number | null, km: number | null) => {
  const parts: string[] = [];
  if (days) {
    const months = Math.round(days / 30.44);
    if (days % 365 === 0) parts.push(days === 365 ? "year" : `${days / 365} years`);
    else if (months >= 1 && Math.abs(months * 30.44 - days) < 3) parts.push(months === 1 ? "month" : `${months} months`);
    else parts.push(plural(days, "day"));
  }
  if (km) parts.push(formatMiles(km));
  return parts.length ? `Every ${parts.join(" or ")}` : "One-off";
};

/** What's left before a check is due, by date and/or distance. */
export const dueText = (item: Pick<MaintenanceItem, "daysLeft" | "kmLeft">) => {
  const parts: string[] = [];
  if (item.daysLeft != null) parts.push(relativeDays(item.daysLeft));
  if (item.kmLeft != null)
    parts.push(item.kmLeft < 0 ? `${formatKm(-item.kmLeft)} over` : `${formatKm(item.kmLeft)} left`);
  return parts.join(" · ");
};

// Mirrors the server's warning window (server/src/vehicles/record-status.ts).
const WARN_DAYS = 30;
const WARN_KM = 2012; // 1,250 mi

const ATTENTION_VERB = { expired: "Expired", expiring: "Expires", overdue: "Overdue since", due_soon: "Due" } as const;

/**
 * Why an item needs attention, naming only the limit that triggered it: a check overdue by
 * distance may still be months away by date. E.g. "Expired Oct 4, 2026 (5 days ago)", "930 mi over".
 */
export const attentionText = (item: AttentionItem) => {
  const parts: string[] = [];
  if (item.daysLeft != null && item.daysLeft <= WARN_DAYS) {
    parts.push(`${ATTENTION_VERB[item.status]} ${formatDate(item.dueOn)} (${relativeDays(item.daysLeft)})`);
  }
  if (item.kmLeft != null && item.kmLeft <= WARN_KM) {
    parts.push(item.kmLeft < 0 ? `${formatKm(-item.kmLeft)} over` : `${formatKm(item.kmLeft)} left`);
  }
  return parts.join(" · ");
};

export const apiErrorMessage = (error: unknown, fallback: string) => {
  const message = (error as { data?: { message?: string | string[] } } | undefined)?.data?.message;
  return Array.isArray(message) ? message.join(", ") : message ?? fallback;
};
