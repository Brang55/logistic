export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

export const CARGO_STATUS: Record<string, [string, Tone]> = {
  new: ["New", "info"],
  edited: ["Needs confirmation", "warning"],
  confirmed: ["Confirmed", "primary"],
  picked_up: ["In transit", "success"],
  delivered: ["Delivered", "neutral"],
  cancelled: ["Cancelled", "danger"],
};

export const cargoStatusLabel = (status: string) => CARGO_STATUS[status]?.[0] ?? status;

/** Case-insensitive match of a search term against several fields. */
export const matches = (term: string, ...fields: (string | number | null | undefined)[]) => {
  const needle = term.trim().toLowerCase();
  return !needle || fields.some((field) => String(field ?? "").toLowerCase().includes(needle));
};

export const initials = (...parts: (string | undefined)[]) =>
  parts
    .filter(Boolean)
    .map((part) => part!.trim()[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** Short, human-friendly reference for a cargo id. */
export const shipmentRef = (id: string) => `SH-${id.slice(0, 6).toUpperCase()}`;
