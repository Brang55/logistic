import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { CargoRoute, LngLat } from "../../app/api/routing";
import type { TruckPosition } from "../../app/api/telematics";
import { theme } from "../../theme";
import { splitLineAt } from "../../utils/geo";
import { mapGestures } from "../../utils/map";
import { useFleetLayer } from "../Fleet/useFleetLayer";

import styles from "./OngoingDelivery.module.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

const FLEET_ROUTES = "track-fleet-routes";
const APPROACH = "track-approach";
const ROUTE = "track-route";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const lines = (...coordinates: LngLat[][]): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: coordinates
    .filter((line) => line.length > 1)
    .map((line) => ({ type: "Feature", geometry: { type: "LineString", coordinates: line }, properties: {} })),
});

/**
 * Every tracked truck live, faint routes of the other trips to their next stop, and the
 * selected shipment's route: dashed from the truck to the pickup, solid on to delivery.
 */
const TrackMap = ({
  cargoId,
  route,
  fromTruck,
  positions,
  labels,
  selectedTruckId,
  onSelectTruck,
  fleetRoutes,
}: {
  /** The selected shipment; the map re-frames only when it changes. */
  cargoId?: string;
  route?: CargoRoute;
  /** `route` starts at the truck's position (so its first leg may be the way to the pickup). */
  fromTruck: boolean;
  positions: TruckPosition[];
  labels: Map<string, string>;
  selectedTruckId?: string;
  onSelectTruck: (truckId: string) => void;
  /** Remaining routes of the other active trips. */
  fleetRoutes: LngLat[][];
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<mapboxgl.Map>();
  const framedFor = useRef<string>();

  useEffect(() => {
    if (!containerRef.current) return;
    const instance = new mapboxgl.Map({
      container: containerRef.current,
      ...mapGestures(),
      style: "mapbox://styles/mapbox/light-v11",
      // Continental US until the fleet's own extent is known.
      center: [-98.5, 39.8],
      zoom: 3,
    });
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    instance.on("load", () => {
      const lineLayout = { "line-join": "round", "line-cap": "round" } as const;
      instance.addSource(FLEET_ROUTES, { type: "geojson", data: EMPTY });
      instance.addLayer({
        id: FLEET_ROUTES,
        type: "line",
        source: FLEET_ROUTES,
        layout: lineLayout,
        paint: { "line-color": theme.primary, "line-width": 3, "line-opacity": 0.3 },
      });
      instance.addSource(ROUTE, { type: "geojson", data: EMPTY });
      instance.addLayer({
        id: `${ROUTE}-casing`,
        type: "line",
        source: ROUTE,
        layout: lineLayout,
        paint: { "line-color": theme.white, "line-width": 9 },
      });
      instance.addLayer({
        id: ROUTE,
        type: "line",
        source: ROUTE,
        layout: lineLayout,
        paint: { "line-color": theme.primary, "line-width": 5 },
      });
      instance.addSource(APPROACH, { type: "geojson", data: EMPTY });
      instance.addLayer({
        id: `${APPROACH}-casing`,
        type: "line",
        source: APPROACH,
        layout: lineLayout,
        paint: { "line-color": theme.white, "line-width": 8 },
      });
      instance.addLayer({
        id: APPROACH,
        type: "line",
        source: APPROACH,
        layout: { "line-join": "round" },
        paint: { "line-color": theme.warning, "line-width": 4, "line-dasharray": [1.5, 1.2] },
      });
      setMap(instance);
    });
    return () => {
      setMap(undefined);
      instance.remove();
    };
  }, []);

  useEffect(() => {
    (map?.getSource(FLEET_ROUTES) as mapboxgl.GeoJSONSource | undefined)?.setData(lines(...fleetRoutes));
  }, [map, fleetRoutes]);

  const plan = route?.routes[0];
  useEffect(() => {
    if (!map) return;
    const geometry = plan?.geometry.coordinates ?? [];
    // From the truck to a load not yet picked up, the first leg is the drive to the pickup.
    const [approach, onward] =
      fromTruck && route && !route.pickedUp && plan?.legs.length ? splitLineAt(geometry, plan.legs[0].distanceM) : [[], geometry];
    (map.getSource(APPROACH) as mapboxgl.GeoJSONSource).setData(lines(approach));
    (map.getSource(ROUTE) as mapboxgl.GeoJSONSource).setData(lines(onward));
    if (!route) return;

    const markers = [
      new mapboxgl.Marker({ color: route.pickedUp ? theme.neutral : theme.success }).setLngLat(route.pickup).addTo(map),
      new mapboxgl.Marker({ color: theme.danger }).setLngLat(route.delivery).addTo(map),
    ];
    if (framedFor.current !== cargoId) {
      framedFor.current = cargoId;
      const bounds = new mapboxgl.LngLatBounds(route.pickup, route.pickup).extend(route.delivery);
      geometry.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, { padding: { top: 160, bottom: 80, left: 60, right: 60 }, maxZoom: 11 });
    }
    return () => markers.forEach((marker) => marker.remove());
  }, [map, route, plan, fromTruck, cargoId]);

  useFleetLayer(map, positions, labels, { selectedTruckId, onSelect: onSelectTruck });

  return (
    <>
      <div ref={containerRef} className={styles.map} />
      <ul className={styles.legend} aria-label="Map legend">
        <li>
          <span className={styles.legendTruck} /> Truck (click to select)
        </li>
        <li>
          <span className={styles.legendApproach} /> Driving to pickup
        </li>
        <li>
          <span className={styles.legendRoute} /> Pickup → delivery
        </li>
        <li>
          <span className={styles.legendFleet} /> Other trips
        </li>
      </ul>
    </>
  );
};

export default TrackMap;
