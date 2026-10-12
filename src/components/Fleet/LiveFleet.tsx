import { useEffect, useMemo, useRef, useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query/react";
import { useSearchParams } from "react-router-dom";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { useFetchCargosQuery } from "../../app/api/cargos";
import { useFetchTrucksQuery } from "../../app/api/trucks";
import {
  useLatestPositionsQuery,
  useTruckHistoryQuery,
} from "../../app/api/telematics";
import { formatAge } from "../../utils/format";
import { Loader } from "../Loader/Loader";
import { MAP_DETAILS_INSET, MapDetailsCard, PanelHeader } from "../ui/ui";
import NextPickups from "./NextPickups";
import { useFleetLayer } from "./useFleetLayer";

import styles from "./LiveFleet.module.css";
import { theme } from "../../theme";
import { formatLength, formatSpeed, formatWeight } from "../../utils/units";
import { isFinished } from "../../utils/status";
import { mapGestures } from "../../utils/map";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

const HISTORY_SOURCE = "truck-history";
const DAY_MS = 24 * 60 * 60 * 1000;
// A truck that hasn't reported for this long is shown as offline.
const OFFLINE_AFTER_MS = 30 * 60 * 1000;

// Keeps the selected truck centred in the part of the map the details card doesn't cover.
const besideDetails = (map: mapboxgl.Map): [number, number] => [
  -Math.min(MAP_DETAILS_INSET, map.getContainer().clientWidth / 2) / 2,
  0,
];

const LiveFleet = () => {
  const { data: trucks, isLoading } = useFetchTrucksQuery();
  const { data: positions } = useLatestPositionsQuery();
  const { data: cargos } = useFetchCargosQuery();

  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<mapboxgl.Map>();
  const [selectedId, setSelectedId] = useState<string>();
  const [follow, setFollow] = useState(true);
  const [now, setNow] = useState(Date.now());
  // Fixed per selection so the history query isn't refetched on every render.
  const [historySince, setHistorySince] = useState<string>();

  const { data: history } = useTruckHistoryQuery(
    selectedId && historySince ? { truckId: selectedId, since: historySince } : skipToken
  );

  const positionsById = useMemo(() => new Map((positions ?? []).map((p) => [p.truckId, p])), [positions]);
  const labels = useMemo(() => new Map((trucks ?? []).map((t) => [t.id, t.truckNumber])), [trucks]);
  const cargoByTruck = useMemo(
    () =>
      new Map(
        (cargos ?? [])
          .filter((c) => c.truckId && !isFinished(c.status))
          // Later entries win in the Map, so a picked-up load beats queued ones for the same truck.
          .sort((a, b) => Number(!!a.pickedUpAt) - Number(!!b.pickedUpAt))
          .map((c) => [c.truckId!, c])
      ),
    [cargos]
  );

  const selectTruck = (truckId: string) => {
    setSelectedId(truckId);
    setHistorySince(new Date(Date.now() - DAY_MS).toISOString());
    const position = positionsById.get(truckId);
    if (position && map) map.flyTo({ center: position.point, zoom: Math.max(map.getZoom(), 7), offset: besideDetails(map) });
  };

  const clearSelection = () => {
    setSelectedId(undefined);
    setHistorySince(undefined);
  };

  // A truck picked on the map may be far down the list: bring its card into view.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    listRef.current
      ?.querySelector(`[data-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  useFleetLayer(map, positions, labels, { selectedTruckId: selectedId, onSelect: selectTruck });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const mapInstance = new mapboxgl.Map({
      container: containerRef.current,
      ...mapGestures(),
      style: "mapbox://styles/mapbox/streets-v12",
      // Continental US until the fleet's own extent is known.
      center: [-98.5, 39.8],
      zoom: 3,
    });
    mapInstance.on("load", () => {
      mapInstance.addSource(HISTORY_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      mapInstance.addLayer({
        id: HISTORY_SOURCE,
        type: "line",
        source: HISTORY_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": theme.accent, "line-width": 4, "line-dasharray": [1, 1.5] },
      });
      setMap(mapInstance);
    });
    return () => {
      setMap(undefined);
      mapInstance.remove();
    };
  }, []);

  // Fit every truck once positions first arrive.
  const fitted = useRef(false);
  useEffect(() => {
    if (!map || fitted.current || !positions?.length) return;
    const bounds = new mapboxgl.LngLatBounds();
    positions.forEach((p) => bounds.extend(p.point));
    map.fitBounds(bounds, { padding: 80, maxZoom: 8, duration: 0 });
    fitted.current = true;
  }, [map, positions]);

  // "?truck=<id>" (the assistant's "show truck on the map") selects that truck once positions are in.
  const [params, setParams] = useSearchParams();
  const requestedTruck = params.get("truck");
  const select = useRef(selectTruck);
  select.current = selectTruck;
  useEffect(() => {
    if (!requestedTruck || !map || !positions) return;
    select.current(requestedTruck);
    setParams({}, { replace: true });
  }, [requestedTruck, map, positions, setParams]);

  // Recent track of the selected truck, extended with its latest live position.
  const selectedPosition = selectedId ? positionsById.get(selectedId) : undefined;
  useEffect(() => {
    if (!map) return;
    const points = (history ?? []).map((p) => p.point);
    if (selectedPosition && points.length) points.push(selectedPosition.point);
    (map.getSource(HISTORY_SOURCE) as mapboxgl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features:
        points.length > 1 ? [{ type: "Feature", geometry: { type: "LineString", coordinates: points }, properties: {} }] : [],
    });
  }, [map, history, selectedPosition]);

  // Don't interrupt a camera move in progress, such as the zoom-in on selection.
  useEffect(() => {
    if (follow && selectedPosition && map && !map.isEasing()) {
      map.easeTo({ center: selectedPosition.point, duration: 1000, offset: besideDetails(map) });
    }
  }, [map, follow, selectedPosition]);

  const selectedTruck = trucks?.find((t) => t.id === selectedId);
  const selectedCargo = selectedId ? cargoByTruck.get(selectedId) : undefined;

  // Undefined until positions load, so trucks don't flash as "No signal".
  const stateOf = (truckId: string) => {
    if (!positions) return undefined;
    const position = positionsById.get(truckId);
    if (!position) return { label: "No signal", className: styles.offline };
    if (now - new Date(position.recordedAt).getTime() > OFFLINE_AFTER_MS) return { label: "Offline", className: styles.offline };
    if ((position.speedKmh ?? 0) > 0) return { label: formatSpeed(position.speedKmh!), className: styles.moving };
    return { label: "Stopped", className: styles.stopped };
  };

  return (
    <div className={styles.fleet}>
      <section className={styles.panel}>
        <PanelHeader
          title="Live fleet"
          subtitle={`Where every truck is now, where it's been today and what it could pick up next · ${trucks?.length ?? 0} trucks · ${(positions ?? []).filter((p) => (p.speedKmh ?? 0) > 0).length} moving now`}
        />
        {/* The map container must always render: the map is created once, on mount. */}
        {isLoading && <Loader />}
        <ul ref={listRef}>
          {trucks?.map((truck) => {
            const state = stateOf(truck.id);
            const position = positionsById.get(truck.id);
            const cargo = cargoByTruck.get(truck.id);
            return (
              <li key={truck.id} data-id={truck.id}>
                <button
                  className={`${styles.truck} ${truck.id === selectedId ? styles.selected : ""}`}
                  onClick={() => selectTruck(truck.id)}
                >
                  <span className={styles.truckName}>
                    {truck.truckNumber} <span className={styles.muted}>{truck.truckModel}</span>
                  </span>
                  <span className={styles.muted}>
                    {cargo ? `${cargo.pickupLocation} → ${cargo.deliveryLocation}` : "No cargo assigned"}
                  </span>
                  <span className={styles.row}>
                    {state && <span className={`${styles.state} ${state.className}`}>{state.label}</span>}
                    {position && <span className={styles.muted}>{formatAge(position.recordedAt, now)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <div className={styles.mapArea}>
        <div ref={containerRef} className={styles.map} />
        {selectedTruck && (
          <MapDetailsCard
            title={`${selectedTruck.truckNumber} · ${selectedTruck.truckModel}`}
            subtitle={[
              stateOf(selectedTruck.id)?.label,
              selectedCargo && `${selectedCargo.pickupLocation} → ${selectedCargo.deliveryLocation}`,
            ]
              .filter(Boolean)
              .join(" · ")}
            onClose={clearSelection}
          >
            <div className={styles.details}>
              <dl>
                <dt>Plate</dt>
                <dd>{selectedTruck.plate || "–"}</dd>
                <dt>Dimensions</dt>
                <dd>
                  {[
                    selectedTruck.heightM && `${formatLength(selectedTruck.heightM)} high`,
                    selectedTruck.widthM && `${formatLength(selectedTruck.widthM)} wide`,
                    selectedTruck.lengthM && `${formatLength(selectedTruck.lengthM)} long`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "–"}
                </dd>
                <dt>Weight / axles</dt>
                <dd>
                  {selectedTruck.weightT ? formatWeight(selectedTruck.weightT * 1000) : "–"} / {selectedTruck.axles ?? "–"}
                </dd>
                <dt>Cargo</dt>
                <dd>
                  {selectedCargo
                    ? `${selectedCargo.descriptionOfGoods || selectedCargo.shipperName} (${selectedCargo.status})`
                    : "–"}
                </dd>
                <dt>Last position</dt>
                <dd>
                  {selectedPosition
                    ? `${selectedPosition.point[1].toFixed(4)}, ${selectedPosition.point[0].toFixed(4)} · ${formatAge(selectedPosition.recordedAt, now)}`
                    : "No signal yet"}
                </dd>
                <dt>Heading</dt>
                <dd>{selectedPosition?.heading != null ? `${Math.round(selectedPosition.heading)}°` : "–"}</dd>
              </dl>
              <label className={styles.follow}>
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow on map
              </label>
              <p className={styles.muted}>Dashed line: track over the last 24 hours ({history?.length ?? 0} fixes).</p>
              <NextPickups truckId={selectedTruck.id} driverId={selectedCargo?.driverId} />
            </div>
          </MapDetailsCard>
        )}
      </div>
    </div>
  );
};

export default LiveFleet;
