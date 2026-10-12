/**
 * Map options for touch screens: one finger scrolls the page and two move the map, so a phone user is not trapped in
 * a map while scrolling. Mapbox shows a "Use two fingers" hint. Mouse users keep wheel zoom.
 */
export const mapGestures = () => ({
  cooperativeGestures: window.matchMedia("(pointer: coarse)").matches,
});
