import { icon, type IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faCarBurst,
  faCloudShowersHeavy,
  faPassport,
  faPersonDigging,
  faRoadBarrier,
  faShieldHalved,
  faTrafficLight,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

import type { ReportType } from "../../app/api/community";

export interface ReportMeta {
  label: string;
  icon: IconDefinition;
  /** Marker and button colour. */
  color: string;
}

// Order is the order of the quick-report buttons.
export const REPORT_TYPES: Record<ReportType, ReportMeta> = {
  traffic: { label: "Traffic jam", icon: faTrafficLight, color: "#d97706" },
  accident: { label: "Accident", icon: faCarBurst, color: "#dc2626" },
  police: { label: "Police", icon: faShieldHalved, color: "#2563eb" },
  roadworks: { label: "Road works", icon: faPersonDigging, color: "#ea580c" },
  hazard: { label: "Hazard", icon: faTriangleExclamation, color: "#ca8a04" },
  closure: { label: "Road closed", icon: faRoadBarrier, color: "#b91c1c" },
  weather: { label: "Bad weather", icon: faCloudShowersHeavy, color: "#0284c7" },
  border: { label: "Border queue", icon: faPassport, color: "#7c3aed" },
};

export const REPORT_TYPE_KEYS = Object.keys(REPORT_TYPES) as ReportType[];

/** A round map marker with the report's icon, for Mapbox's DOM markers. */
export const reportMarkerElement = (type: ReportType, className: string) => {
  const meta = REPORT_TYPES[type] ?? REPORT_TYPES.hazard;
  const el = document.createElement("div");
  el.className = className;
  el.style.background = meta.color;
  el.title = meta.label;
  el.innerHTML = icon(meta.icon).html.join("");
  return el;
};
