export interface ChecklistItem {
  type: string;
  title: string;
  intervalDays?: number;
  intervalKm?: number;
}

/** Common recurring checks; applying a checklist adds the ones a vehicle doesn't have yet. */
export const CHECKLISTS: Record<string, { label: string; items: ChecklistItem[] }> = {
  "eu-truck": {
    label: "EU truck",
    items: [
      { type: "technical_inspection", title: "Annual technical inspection", intervalDays: 365 },
      { type: "tachograph", title: "Tachograph calibration", intervalDays: 730 },
      { type: "oil_change", title: "Engine oil and filters", intervalDays: 365, intervalKm: 60000 },
      { type: "brakes", title: "Brake inspection", intervalDays: 182 },
      { type: "tyres", title: "Tyre check (tread and pressure)", intervalDays: 91 },
      { type: "fire_extinguisher", title: "Fire extinguisher service", intervalDays: 365 },
      { type: "first_aid", title: "First-aid kit check", intervalDays: 365 },
    ],
  },
  "us-truck": {
    label: "US truck",
    items: [
      { type: "dot_inspection", title: "DOT annual inspection", intervalDays: 365 },
      { type: "oil_change", title: "Engine oil and filters", intervalDays: 365, intervalKm: 40_234 }, // 25,000 mi
      { type: "brakes", title: "Brake inspection", intervalDays: 182 },
      { type: "tyres", title: "Tyre check (tread and pressure)", intervalDays: 91 },
      { type: "ifta_irp", title: "IFTA / IRP renewal", intervalDays: 365 },
    ],
  },
  trailer: {
    label: "Trailer",
    items: [
      { type: "technical_inspection", title: "Annual technical inspection", intervalDays: 365 },
      { type: "brakes", title: "Brake inspection", intervalDays: 182 },
      { type: "tyres", title: "Tyre check (tread and pressure)", intervalDays: 91 },
      { type: "lights", title: "Lights and reflectors", intervalDays: 91 },
    ],
  },
};
