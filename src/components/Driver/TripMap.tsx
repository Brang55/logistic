import { useEffect, useRef, useState } from "react";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { RoadReport } from "../../app/features/driver/communitySlice";
import type { MyTrip } from "../../app/features/driver/tripsSlice";
import { theme } from "../../theme";

import { reportMarkerElement } from "./reportTypes";

import styles from "./DriverTrip.module.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

type Trip = NonNullable<MyTrip["trip"]>;

const stopMarker = (kind: "pickup" | "delivery") => {
  const el = document.createElement("div");
  el.className = `${styles.stopMarker} ${kind === "pickup" ? styles.stopMarkerPickup : styles.stopMarkerDelivery}`;
  el.textContent = kind === "pickup" ? "A" : "B";
  return el;
};

/** The route from the truck to the remaining stops, framed on the next stop, with drivers' road reports. */
const TripMap = ({ trip, reports }: { trip: Trip; reports?: RoadReport[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<mapboxgl.Map>();

  useEffect(() => {
    if (!containerRef.current) return;
    const mapInstance = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: trip.position?.point ?? trip.nextStop.point,
      zoom: 9,
      attributionControl: false,
    });
    mapInstance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapInstance.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    mapInstance.on("load", () => {
      mapInstance.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      mapInstance.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": theme.white, "line-width": 9 },
      });
      mapInstance.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": theme.primary, "line-width": 5 },
      });
      setMap(mapInstance);
    });
    return () => {
      setMap(undefined);
      mapInstance.remove();
    };
    // The map is created once; later trip updates only change its data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const route = trip.route;
  const position = trip.position?.point;
  useEffect(() => {
    if (!map) return;
    (map.getSource("route") as mapboxgl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: route ? [{ type: "Feature", geometry: route.geometry, properties: {} }] : [],
    });
    const markers = trip.stops.map((stop) =>
      new mapboxgl.Marker({ element: stopMarker(stop.kind) }).setLngLat(stop.point).addTo(map)
    );
    if (position) {
      const el = document.createElement("div");
      el.className = styles.truckMarker;
      markers.push(new mapboxgl.Marker({ element: el }).setLngLat(position).addTo(map));
    }
    return () => markers.forEach((marker) => marker.remove());
  }, [map, route, position, trip.stops]);

  useEffect(() => {
    if (!map || !reports) return;
    const markers = reports.map((report) =>
      new mapboxgl.Marker({ element: reportMarkerElement(report.type, styles.reportMarker) })
        .setLngLat(report.point)
        .setPopup(new mapboxgl.Popup({ offset: 16, closeButton: false }).setText(`${report.label}${report.note ? ` · ${report.note}` : ""}`))
        .addTo(map)
    );
    return () => markers.forEach((marker) => marker.remove());
  }, [map, reports]);

  // Frame the way to the next stop whenever the stop changes.
  const nextStopKey = `${trip.nextStop.cargoId}:${trip.nextStop.kind}`;
  useEffect(() => {
    if (!map) return;
    const bounds = new mapboxgl.LngLatBounds(trip.nextStop.point, trip.nextStop.point);
    if (position) bounds.extend(position);
    map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, nextStopKey]);

  return <div ref={containerRef} className={styles.map} />;
};

export default TripMap;
