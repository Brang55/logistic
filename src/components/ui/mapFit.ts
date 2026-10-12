import type { IControl, Map as MapboxMap } from "mapbox-gl";

import { isPhone } from "../../hooks/useMediaQuery";

/** Room the map keeps free on its right while a MapDetailsCard is open: card width plus gutters. */
export const MAP_DETAILS_INSET = 412;

/**
 * How much of the map's right side the details card covers. On phones the card sits under the
 * map instead of over it, so nothing is covered.
 */
export const mapDetailsInset = (map: MapboxMap) =>
  isPhone() ? 0 : Math.min(MAP_DETAILS_INSET, map.getContainer().clientWidth / 2);

/** Gap kept between the map's edge and what it frames; phone maps are small, so less there. */
export const fitPadding = (wide = 60) => (isPhone() ? 32 : wide);

// Four corners pointing out: "fit everything".
const EXPAND_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';

/** Map button that frames everything on the map again. */
export class ShowAllControl implements IControl {
  private container?: HTMLDivElement;

  constructor(private readonly onClick: () => void) {}

  onAdd() {
    const container = document.createElement("div");
    container.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
    const button = document.createElement("button");
    button.type = "button";
    button.title = "Show all";
    button.setAttribute("aria-label", "Show all");
    button.innerHTML = EXPAND_ICON;
    button.style.display = "grid";
    button.style.placeItems = "center";
    button.addEventListener("click", this.onClick);
    container.appendChild(button);
    this.container = container;
    return container;
  }

  onRemove() {
    this.container?.remove();
  }
}

/** Map options shared by the map pages: on touch screens, gestures only pan and zoom. */
export const FLAT_MAP_OPTIONS = { dragRotate: false, pitchWithRotate: false, touchPitch: false } as const;
