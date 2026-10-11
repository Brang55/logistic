/** Quick road reports drivers can drop with one tap, and how long each stays on the map. */
export const REPORT_TYPES = {
  traffic: { label: "Traffic jam", ttlHours: 1 },
  accident: { label: "Accident", ttlHours: 2 },
  police: { label: "Police", ttlHours: 2 },
  roadworks: { label: "Road works", ttlHours: 72 },
  hazard: { label: "Hazard on road", ttlHours: 2 },
  closure: { label: "Road closed", ttlHours: 12 },
  weather: { label: "Bad weather", ttlHours: 3 },
  border: { label: "Border queue", ttlHours: 3 },
} as const;

export type ReportType = keyof typeof REPORT_TYPES;
export const REPORT_TYPE_KEYS = Object.keys(REPORT_TYPES) as ReportType[];
