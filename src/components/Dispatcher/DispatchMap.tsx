import { useEffect, useRef, useState } from "react";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type Cargo from "../../app/api/cargos";
import type { CargoRoute } from "../../app/api/routing";
import type { TruckPosition } from "../../app/api/telematics";
import { useFleetLayer } from "../Fleet/useFleetLayer";
import { FLAT_MAP_OPTIONS, fitPadding, mapDetailsInset, ShowAllControl } from "../ui/mapFit";

import page from "../ui/mapPage.module.css";
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
  const showAllRef = useRef(() => {});

  useEffect(() => {
    if (!containerRef.current) return;

    const mapInstance = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      // Continental US until the fleet's own extent is known.
      center: [-98.5, 39.8],
      zoom: 3,
      ...FLAT_MAP_OPTIONS,
    });
    mapInstance.touchZoomRotate.disableRotation();
    mapInstance.addControl(new ShowAllControl(() => showAllRef.current()), "top-left");
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

  // Frame every cargo in the queue: on first load, when a load is deselected, and from the "Show all" button.
  const showAll = (instant = false) => {
    const points = cargos.filter((cargo) => cargo.pickupPoint);
    if (!map || !points.length) return false;
    const bounds = new mapboxgl.LngLatBounds();
    points.forEach((cargo) => bounds.extend([cargo.pickupPoint!.x, cargo.pickupPoint!.y]));
    // An explicit `duration: undefined` would break mapbox's animation, so leave it out to animate.
    map.fitBounds(bounds, { padding: fitPadding(), maxZoom: 8, ...(instant && { duration: 0 }) });
    return true;
  };
  showAllRef.current = showAll;

  const fittedRef = useRef(false);
  useEffect(() => {
    if (!fittedRef.current) fittedRef.current = showAll(true);
    // Only once the map and the first cargo are in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, cargos]);

  const hadSelection = useRef(false);
  useEffect(() => {
    if (selectedId) hadSelection.current = true;
    else if (hadSelection.current) {
      hadSelection.current = false;
      showAllRef.current();
    }
  }, [selectedId]);

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
    const padding = fitPadding();
    map.fitBounds(bounds, { padding: { top: padding, bottom: padding, left: padding, right: padding + mapDetailsInset(map) } });

    return () => markers.forEach((marker) => marker.remove());
  }, [map, route, routeIndex]);

  useFleetLayer(map, truckPositions, truckLabels, { selectedTruckId });

  return <div ref={containerRef} className={page.map} />;
};

export default DispatchMap;
