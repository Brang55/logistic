import { useEffect, useRef, useState } from "react";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type Cargo from "../../app/features/driver/cargoSlice";
import type { CargoRoute } from "../../app/features/driver/routingSlice";
import type { TruckPosition } from "../../app/features/driver/telematicsSlice";
import { useFleetLayer } from "../Fleet/useFleetLayer";
import { MAP_DETAILS_INSET } from "../ui/ui";

import styles from "./Dispatcher.module.css";
import { theme } from "../../theme";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

interface DispatchMapProps {
  cargos: Cargo[];
  selectedId?: string;
  onSelect: (id: string) => void;
  route?: CargoRoute;
  routeIndex: number;
  truckPositions?: TruckPosition[];
  truckLabels: Map<string, string>;
  selectedTruckId?: string;
}

const emptyCollection: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const STATUS_COLORS: mapboxgl.ExpressionSpecification = [
  "match",
  ["get", "status"],
  "confirmed",
  theme.success,
  "edited",
  theme.warning,
  theme.primary,
];

function addLayers(map: mapboxgl.Map) {
  for (const id of ["cargo", "routes", "restrictions", "incidents"]) {
    map.addSource(id, { type: "geojson", data: emptyCollection });
  }
  map.addLayer({
    id: "routes-alternative",
    type: "line",
    source: "routes",
    filter: ["!=", ["get", "selected"], true],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": theme.routeAlternative, "line-width": 5 },
  });
  map.addLayer({
    id: "routes-selected",
    type: "line",
    source: "routes",
    filter: ["==", ["get", "selected"], true],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": theme.primary, "line-width": 6 },
  });
  // Road segments where the truck exceeds a height, width or weight limit.
  map.addLayer({
    id: "restrictions",
    type: "line",
    source: "restrictions",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": theme.danger, "line-width": 9 },
  });
  map.addLayer({
    id: "incidents",
    type: "circle",
    source: "incidents",
    paint: {
      "circle-radius": 6,
      "circle-color": theme.warning,
      "circle-stroke-color": theme.white,
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "cargo",
    type: "circle",
    source: "cargo",
    paint: {
      "circle-radius": ["case", ["get", "selected"], 10, 7],
      "circle-color": STATUS_COLORS,
      "circle-stroke-color": theme.white,
      "circle-stroke-width": 2,
    },
  });
}

const DispatchMap = ({
  cargos,
  selectedId,
  onSelect,
  route,
  routeIndex,
  truckPositions,
  truckLabels,
  selectedTruckId,
}: DispatchMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<mapboxgl.Map>();
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current) return;

    const mapInstance = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      // Continental US until the fleet's own extent is known.
      center: [-98.5, 39.8],
      zoom: 3,
    });
    mapInstance.on("load", () => {
      addLayers(mapInstance);
      mapInstance.on("click", "cargo", (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (id) onSelectRef.current(id);
      });
      mapInstance.on("mouseenter", "cargo", () => (mapInstance.getCanvas().style.cursor = "pointer"));
      mapInstance.on("mouseleave", "cargo", () => (mapInstance.getCanvas().style.cursor = ""));
      setMap(mapInstance);
    });

    return () => {
      setMap(undefined);
      mapInstance.remove();
    };
  }, []);

  // Pickup points of every cargo in the queue. While a route is shown, its markers
  // stand in for the selected cargo's dot.
  useEffect(() => {
    if (!map) return;
    const features = cargos
      .filter((cargo) => cargo.pickupPoint && !(route && cargo.id === selectedId))
      .map((cargo) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [cargo.pickupPoint!.x, cargo.pickupPoint!.y] },
        properties: { id: cargo.id, status: cargo.status, selected: cargo.id === selectedId },
      }));
    (map.getSource("cargo") as mapboxgl.GeoJSONSource).setData({ type: "FeatureCollection", features });
  }, [map, cargos, selectedId, route]);

  // Fit all cargo once, on first load.
  const fittedRef = useRef(false);
  useEffect(() => {
    if (!map || fittedRef.current) return;
    const points = cargos.filter((cargo) => cargo.pickupPoint);
    if (!points.length) return;
    const bounds = new mapboxgl.LngLatBounds();
    points.forEach((cargo) => bounds.extend([cargo.pickupPoint!.x, cargo.pickupPoint!.y]));
    map.fitBounds(bounds, { padding: 60, maxZoom: 8, duration: 0 });
    fittedRef.current = true;
  }, [map, cargos]);

  // Route options, restriction segments and incidents for the selected cargo.
  useEffect(() => {
    if (!map) return;
    const plans = route?.routes ?? [];
    const selected = plans[routeIndex];

    const setData = (source: string, features: GeoJSON.Feature[]) =>
      (map.getSource(source) as mapboxgl.GeoJSONSource).setData({ type: "FeatureCollection", features });

    setData(
      "routes",
      plans.map((plan, index) => ({
        type: "Feature",
        geometry: plan.geometry,
        properties: { selected: index === routeIndex },
      }))
    );
    setData(
      "restrictions",
      (selected?.notices ?? [])
        .filter((notice) => notice.type === "violation" && notice.coordinates && notice.coordinates.length > 1)
        .map((notice) => ({
          type: "Feature",
          geometry: { type: "LineString", coordinates: notice.coordinates! },
          properties: { message: notice.message },
        }))
    );
    setData(
      "incidents",
      (selected?.incidents ?? [])
        .filter((incident) => incident.location)
        .map((incident) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: incident.location! },
          properties: { description: incident.description },
        }))
    );

    if (!route) return;
    const markers = [
      new mapboxgl.Marker({ color: theme.success }).setLngLat(route.pickup).addTo(map),
      new mapboxgl.Marker({ color: theme.danger }).setLngLat(route.delivery).addTo(map),
    ];
    const bounds = new mapboxgl.LngLatBounds(route.pickup, route.pickup).extend(route.delivery);
    selected?.geometry.coordinates.forEach((point) => bounds.extend(point));
    // A route only exists for a selected load, so its details card covers the map's right side.
    const inset = Math.min(MAP_DETAILS_INSET, map.getContainer().clientWidth / 2);
    map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 60, right: 60 + inset } });

    return () => markers.forEach((marker) => marker.remove());
  }, [map, route, routeIndex]);

  useFleetLayer(map, truckPositions, truckLabels, { selectedTruckId });

  return <div ref={containerRef} className={styles.map} />;
};

export default DispatchMap;
