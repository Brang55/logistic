import { useEffect, useRef, useState } from "react";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { RoadReport } from "../../app/api/community";
import type { LngLat } from "../../app/api/routing";
import { reportMarkerElement } from "./reportTypes";

import styles from "./DriverTrip.module.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

const USA: LngLat = [-98.5, 39.8];

interface Props {
  reports: RoadReport[];
  /** The viewer's truck; null frames all reports instead. */
  position: LngLat | null;
  /** The report to fly to and open, e.g. when picked in the list. */
  focusId?: string;
}

/** Every active road report, centred on the driver's truck (or framing the reports without one). */
const ReportsMap = ({ reports, position, focusId }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<mapboxgl.Map>();
  const markers = useRef(new Map<string, mapboxgl.Marker>());

  useEffect(() => {
    if (!containerRef.current) return;
    const mapInstance = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: position ?? USA,
      zoom: position ? 8 : 4,
      attributionControl: false,
    });
    mapInstance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapInstance.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    mapInstance.on("load", () => setMap(mapInstance));
    return () => {
      setMap(undefined);
      mapInstance.remove();
    };
    // Created once; the effects below keep it in sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map) return;
    const current = markers.current;
    for (const report of reports) {
      const marker = new mapboxgl.Marker({ element: reportMarkerElement(report.type, styles.reportMarker) })
        .setLngLat(report.point)
        .setPopup(
          new mapboxgl.Popup({ offset: 18, closeButton: false }).setText(
            `${report.label}${report.note ? ` · ${report.note}` : ""} (${report.reporter.name})`
          )
        )
        .addTo(map);
      current.set(report.id, marker);
    }
    return () => {
      current.forEach((marker) => marker.remove());
      current.clear();
    };
  }, [map, reports]);

  // Without a truck to centre on, frame the reports once they first arrive.
  const framed = useRef(false);
  useEffect(() => {
    if (!map || position || framed.current || reports.length === 0) return;
    framed.current = true;
    const bounds = new mapboxgl.LngLatBounds(reports[0].point, reports[0].point);
    reports.forEach((report) => bounds.extend(report.point));
    map.fitBounds(bounds, { padding: 60, maxZoom: 10, duration: 0 });
  }, [map, position, reports]);

  useEffect(() => {
    if (!map || !position) return;
    const el = document.createElement("div");
    el.className = styles.truckMarker;
    const marker = new mapboxgl.Marker({ element: el }).setLngLat(position).addTo(map);
    return () => void marker.remove();
  }, [map, position]);

  useEffect(() => {
    if (!map || !focusId) return;
    const marker = markers.current.get(focusId);
    if (!marker) return;
    map.flyTo({ center: marker.getLngLat(), zoom: Math.max(map.getZoom(), 11) });
    markers.current.forEach((m) => m.getPopup()?.isOpen() && m.togglePopup());
    marker.togglePopup();
  }, [map, focusId]);

  return <div ref={containerRef} className={styles.map} />;
};

export default ReportsMap;
