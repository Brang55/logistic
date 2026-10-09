import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";

import type { TruckPosition } from "../../app/features/driver/telematicsSlice";
import type { LngLat } from "../../app/features/driver/routingSlice";
import { theme } from "../../theme";

const SOURCE = "fleet";
const LAYER = "fleet-trucks";
const ICON = "fleet-arrow";
// Glide between fixes instead of jumping; slightly shorter than the usual update interval.
const ANIMATION_MS = 1500;

// White navigation arrow; rendered as an SDF so the layer can tint it per truck.
function arrowImage(size = 48) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = theme.white;
  ctx.beginPath();
  ctx.moveTo(size / 2, 4);
  ctx.lineTo(size - 8, size - 6);
  ctx.lineTo(size / 2, size - 16);
  ctx.lineTo(8, size - 6);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

function addFleetLayer(map: mapboxgl.Map) {
  if (map.getSource(SOURCE)) return;
  map.addImage(ICON, arrowImage(), { sdf: true, pixelRatio: 2 });
  map.addSource(SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: LAYER,
    type: "symbol",
    source: SOURCE,
    layout: {
      "icon-image": ICON,
      "icon-size": ["case", ["get", "selected"], 1.4, 1],
      "icon-rotate": ["get", "heading"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "text-field": ["get", "label"],
      "text-size": 11,
      "text-offset": [0, 1.6],
      "text-allow-overlap": true,
    },
    paint: {
      "icon-color": [
        "case",
        ["get", "selected"],
        theme.accent,
        ["get", "moving"],
        theme.primary,
        theme.neutral,
      ],
      "icon-halo-color": theme.white,
      "icon-halo-width": 2,
      "text-color": theme.text,
      "text-halo-color": theme.white,
      "text-halo-width": 1.5,
    },
  });
}

interface Animation {
  from: LngLat;
  to: LngLat;
  start: number;
}

const lerp = (from: LngLat, to: LngLat, t: number): LngLat => [
  from[0] + (to[0] - from[0]) * t,
  from[1] + (to[1] - from[1]) * t,
];

/**
 * Draws live truck positions as heading arrows that glide between updates.
 * `labels` maps truck id to the text shown under the arrow.
 */
export function useFleetLayer(
  map: mapboxgl.Map | undefined,
  positions: TruckPosition[] | undefined,
  labels: Map<string, string>,
  options: { selectedTruckId?: string; onSelect?: (truckId: string) => void } = {}
) {
  const { selectedTruckId, onSelect } = options;
  const shown = useRef(new Map<string, LngLat>());
  const animations = useRef(new Map<string, Animation>());
  const frame = useRef<number>();
  const latest = useRef({ positions, labels, selectedTruckId });
  latest.current = { positions, labels, selectedTruckId };
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!map) return;
    addFleetLayer(map);
    const handleClick = (event: mapboxgl.MapMouseEvent & { features?: mapboxgl.GeoJSONFeature[] }) => {
      const id = event.features?.[0]?.properties?.id;
      if (id) onSelectRef.current?.(id);
    };
    const pointer = () => (map.getCanvas().style.cursor = "pointer");
    const reset = () => (map.getCanvas().style.cursor = "");
    map.on("click", LAYER, handleClick);
    map.on("mouseenter", LAYER, pointer);
    map.on("mouseleave", LAYER, reset);
    return () => {
      map.off("click", LAYER, handleClick);
      map.off("mouseenter", LAYER, pointer);
      map.off("mouseleave", LAYER, reset);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;

    const render = (now: number) => {
      let running = false;
      for (const [truckId, animation] of animations.current) {
        const t = Math.min((now - animation.start) / ANIMATION_MS, 1);
        shown.current.set(truckId, lerp(animation.from, animation.to, t));
        if (t < 1) running = true;
        else animations.current.delete(truckId);
      }

      const { positions: current = [], labels: names, selectedTruckId: selected } = latest.current;
      (map.getSource(SOURCE) as mapboxgl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: current.map((position) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: shown.current.get(position.truckId) ?? position.point },
          properties: {
            id: position.truckId,
            label: names.get(position.truckId) ?? "",
            heading: position.heading ?? 0,
            moving: (position.speedKmh ?? 0) > 0,
            selected: position.truckId === selected,
          },
        })),
      });
      frame.current = running ? requestAnimationFrame(render) : undefined;
    };

    const now = performance.now();
    for (const position of positions ?? []) {
      const from = shown.current.get(position.truckId);
      if (!from) shown.current.set(position.truckId, position.point);
      else if (from[0] !== position.point[0] || from[1] !== position.point[1]) {
        animations.current.set(position.truckId, { from, to: position.point, start: now });
      }
    }
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(render);
  }, [map, positions, labels, selectedTruckId]);
}
