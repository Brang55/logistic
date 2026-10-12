import { useEffect, useMemo, useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationArrow, faLocationDot, faPhone, faRoute, faTruck, faUser } from "@fortawesome/free-solid-svg-icons";

import type Cargo from "../../app/api/cargos";
import { useFetchCargosQuery } from "../../app/api/cargos";
import { useFetchDriversQuery } from "../../app/api/drivers";
import { useCargoRouteQuery, type CargoRoute, type LngLat } from "../../app/api/routing";
import { useLatestPositionsQuery } from "../../app/api/telematics";
import { useTrafficReportQuery, type TripTraffic } from "../../app/api/trips";
import { useFetchTrucksQuery } from "../../app/api/trucks";
import { formatAge, formatDistance, formatDuration } from "../../utils/format";
import { distanceKm } from "../../utils/geo";
import { Loader } from "../Loader/Loader";
import { CargoStatus, EmptyState, FilterChips, SearchInput } from "../ui/ui";
import { cx, matches, shipmentRef } from "../ui/helpers";
import ui from "../ui/ui.module.css";
import styles from "./OngoingDelivery.module.css";
import TrackMap from "./TrackMap";
import { formatSpeed } from "../../utils/units";
import { isFinished } from "../../utils/status";

type Filter = "active" | "transit" | "scheduled";

// Tracked: not finished, and either on the road or committed (confirmed or with a truck).
const isTracked = (c: Cargo) => !isFinished(c.status) && (c.status === "picked_up" || c.status === "confirmed" || !!c.truckId);

const inFilter = (c: Cargo, filter: Filter) =>
  filter === "active" || (filter === "transit" ? c.status === "picked_up" : c.status !== "picked_up");

// Same cadence as the server's traffic monitor, which computes every trip's remaining route.
const TRIPS_REFRESH_MS = 5 * 60_000;
// Re-route the selected shipment from the truck only once it has moved this far.
const REROUTE_KM = 5;

// The load a truck is working on now: the one on board, else the earliest pickup (as the server orders them).
const currentLoadByTruck = (cargos: Cargo[]) => {
  const current = new Map<string, Cargo>();
  const rank = (c: Cargo) => [c.pickedUpAt ? 0 : 1, c.pickupDate || "9999"] as const;
  for (const cargo of cargos) {
    if (!cargo.truckId || isFinished(cargo.status)) continue;
    const held = current.get(cargo.truckId);
    const [a, b] = [rank(cargo), held && rank(held)];
    if (!b || a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) current.set(cargo.truckId, cargo);
  }
  return current;
};

const headingText = (trip: TripTraffic) => {
  const where = `${trip.nextStop.kind === "pickup" ? "Heading to pickup" : "Heading to delivery"} in ${trip.nextStop.name}`;
  return trip.remainingS !== null && trip.remainingM !== null
    ? `${where} · ${formatDuration(trip.remainingS)} · ${formatDistance(trip.remainingM)}`
    : where;
};

const formatDate = (iso: string) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "–";

const OngoingDelivery = () => {
  const { data: cargos = [], isLoading } = useFetchCargosQuery();
  const { data: trucks = [] } = useFetchTrucksQuery();
  const { data: drivers = [] } = useFetchDriversQuery();
  const { data: positions = [] } = useLatestPositionsQuery();
  const { data: traffic } = useTrafficReportQuery(undefined, { pollingInterval: TRIPS_REFRESH_MS });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [selectedId, setSelectedId] = useState<string>();

  const trucksById = useMemo(() => new Map(trucks.map((t) => [t.id, t])), [trucks]);
  const driversById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const positionByTruck = useMemo(() => new Map(positions.map((p) => [p.truckId, p])), [positions]);
  const tripByCargo = useMemo(() => new Map((traffic?.trips ?? []).map((t) => [t.cargoId, t])), [traffic]);
  const currentByTruck = useMemo(() => currentLoadByTruck(cargos), [cargos]);

  const tracked = cargos.filter(isTracked);
  const visible = tracked.filter((c) => {
    const truck = c.truckId ? trucksById.get(c.truckId) : undefined;
    const driver = c.driverId ? driversById.get(c.driverId) : undefined;
    return (
      inFilter(c, filter) &&
      matches(search, shipmentRef(c.id), c.pickupLocation, c.deliveryLocation, c.shipperName, c.receiverName, truck?.truckNumber, driver?.lastName)
    );
  });

  // Keep a shipment selected: the first visible one until the user picks another.
  useEffect(() => {
    if (!visible.length) return;
    if (!selectedId || !visible.some((c) => c.id === selectedId)) setSelectedId(visible[0].id);
  }, [visible, selectedId]);

  const selected = tracked.find((c) => c.id === selectedId);
  const selectedTruck = selected?.truckId ? trucksById.get(selected.truckId) : undefined;
  const selectedPosition = selectedTruck ? positionByTruck.get(selectedTruck.id) : undefined;
  const currentOfTruck = selectedTruck ? currentByTruck.get(selectedTruck.id) : undefined;
  // Only the load the truck is working on now is routed from where the truck is.
  const isCurrent = !!selected && currentOfTruck?.id === selected.id;
  const queuedAfter = selected && currentOfTruck && !isCurrent ? currentOfTruck : undefined;

  // Where the selected shipment's route starts: the truck's position, kept until it moves on.
  const [routeFrom, setRouteFrom] = useState<{ cargoId: string; point: LngLat }>();
  const livePoint = isCurrent ? selectedPosition?.point : undefined;
  useEffect(() => {
    if (!selected || !livePoint) return;
    setRouteFrom((prev) =>
      prev?.cargoId === selected.id && distanceKm(prev.point, livePoint) < REROUTE_KM ? prev : { cargoId: selected.id, point: livePoint }
    );
  }, [selected, livePoint]);
  // Shipments whose truck can't be routed from where it is (e.g. on another continent).
  const [unroutableFrom, setUnroutableFrom] = useState<Set<string>>(() => new Set());
  const canRouteFromTruck = !!livePoint && !!selected && !unroutableFrom.has(selected.id);
  const from = canRouteFromTruck && routeFrom?.cargoId === selected?.id ? routeFrom?.point : undefined;
  // Wait for the truck's position rather than routing twice (without, then with it).
  const waitingForFrom = canRouteFromTruck && !from;
  const { currentData, isFetching: routing, isError } = useCargoRouteQuery(
    selected && !waitingForFrom ? { cargoId: selected.id, from } : skipToken
  );
  useEffect(() => {
    if (isError && from && selected) setUnroutableFrom((prev) => new Set(prev).add(selected.id));
  }, [isError, from, selected]);
  // Keep showing the shipment's last route while it is re-routed from the truck's new position,
  // but never another shipment's route.
  const [shown, setShown] = useState<{ cargoId: string; route: CargoRoute; fromTruck: boolean }>();
  useEffect(() => {
    if (selected && currentData) setShown({ cargoId: selected.id, route: currentData, fromTruck: !!from });
    // `from` belongs to the same arguments as `currentData`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentData, selected?.id]);
  const route = shown && shown.cargoId === selected?.id ? shown.route : undefined;
  const fromTruck = !!route && !!shown?.fromTruck;
  const plan = route?.routes[0];
  const legs = plan?.legs ?? [];
  const approachLeg = fromTruck && !route?.pickedUp ? legs[0] : undefined;
  const onwardLeg = fromTruck ? (route?.pickedUp ? legs[0] : legs[1]) : legs[0];

  // Every tracked shipment's truck on the map, labelled with its plate.
  const trackedTruckIds = useMemo(() => new Set(tracked.map((c) => c.truckId).filter(Boolean) as string[]), [tracked]);
  const mapPositions = useMemo(() => positions.filter((p) => trackedTruckIds.has(p.truckId)), [positions, trackedTruckIds]);
  const mapLabels = useMemo(
    () => new Map([...trackedTruckIds].map((id) => [id, trucksById.get(id)?.truckNumber ?? ""])),
    [trackedTruckIds, trucksById]
  );
  const fleetRoutes = useMemo(
    () =>
      (traffic?.trips ?? [])
        .filter((t) => t.cargoId !== selected?.id && t.geometry && trackedTruckIds.has(t.truckId))
        .map((t) => t.geometry!),
    [traffic, selected?.id, trackedTruckIds]
  );
  const selectTruck = (truckId: string) => {
    const load = currentByTruck.get(truckId);
    if (load && tracked.some((c) => c.id === load.id)) {
      setFilter("active");
      setSearch("");
      setSelectedId(load.id);
    }
  };

  if (isLoading) return <Loader />;

  return (
    <div className={styles.track}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h1 className={ui.title}>Track cargo</h1>
          <p className={ui.subtitle}>Every load on the road: where its truck is now and where it's heading</p>
          <p className={ui.subtitle}>
            {tracked.filter((c) => c.status === "picked_up").length} in transit · {tracked.filter((c) => c.status !== "picked_up").length} scheduled
          </p>
          <div className={styles.controls}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search shipment, city, truck or driver" />
            <FilterChips<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: "active", label: "All active", count: tracked.length },
                { value: "transit", label: "In transit", count: tracked.filter((c) => c.status === "picked_up").length },
                { value: "scheduled", label: "Scheduled", count: tracked.filter((c) => c.status !== "picked_up").length },
              ]}
            />
          </div>
        </div>

        <ul className={styles.list}>
          {visible.length === 0 && (
            <EmptyState
              icon={faRoute}
              title={tracked.length ? "No shipments match" : "Nothing to track yet"}
              text={tracked.length ? "Try a different search or filter." : "Confirmed loads and loads with a truck show up here."}
            />
          )}
          {visible.map((cargo) => {
            const truck = cargo.truckId ? trucksById.get(cargo.truckId) : undefined;
            const driver = cargo.driverId ? driversById.get(cargo.driverId) : undefined;
            const position = truck ? positionByTruck.get(truck.id) : undefined;
            const trip = tripByCargo.get(cargo.id);
            const ahead = truck && !trip ? currentByTruck.get(truck.id) : undefined;
            return (
              <li key={cargo.id}>
                <button
                  className={cx(styles.shipment, cargo.id === selectedId && styles.selected)}
                  onClick={() => setSelectedId(cargo.id)}
                >
                  <div className={styles.shipmentTop}>
                    <span>
                      <span className={ui.primaryText}>{shipmentRef(cargo.id)}</span>
                      <span className={ui.secondaryText}>{cargo.descriptionOfGoods || "Cargo"}</span>
                    </span>
                    <CargoStatus status={cargo.status} />
                  </div>

                  <ol className={styles.stops}>
                    <li>
                      <span className={cx(styles.stopDot, cargo.pickedUpAt && styles.done)} />
                      <span>
                        <span className={styles.stopCity}>{cargo.pickupLocation}</span>
                        <span className={ui.secondaryText}>Pickup · {formatDate(cargo.pickupDate)}</span>
                      </span>
                    </li>
                    <li>
                      <FontAwesomeIcon icon={faLocationDot} className={styles.stopPin} />
                      <span>
                        <span className={styles.stopCity}>{cargo.deliveryLocation}</span>
                        <span className={ui.secondaryText}>Delivery · {formatDate(cargo.deliveryDate)}</span>
                      </span>
                    </li>
                  </ol>

                  <div className={styles.meta}>
                    <span>
                      <FontAwesomeIcon icon={faTruck} /> {truck?.truckNumber ?? "No truck"}
                    </span>
                    <span>
                      <FontAwesomeIcon icon={faUser} /> {driver ? `${driver.firstName} ${driver.lastName}` : "No driver"}
                    </span>
                    {position && (
                      <span className={ui.muted}>
                        {(position.speedKmh ?? 0) > 0 ? formatSpeed(position.speedKmh!) : "Stopped"} · {formatAge(position.recordedAt)}
                      </span>
                    )}
                  </div>

                  {trip && (
                    <div className={styles.heading}>
                      <FontAwesomeIcon icon={faLocationArrow} /> {headingText(trip)}
                    </div>
                  )}
                  {ahead && ahead.id !== cargo.id && (
                    <div className={cx(styles.heading, styles.queued)}>Queued after {shipmentRef(ahead.id)}</div>
                  )}

                  {cargo.delayMinutes ? (
                    <div className={styles.delay}>
                      Delayed {cargo.delayMinutes} min{cargo.delayReason && ` · ${cargo.delayReason}`}
                    </div>
                  ) : null}

                  {cargo.receiverPhone && (
                    <div className={styles.contact}>
                      <span className={ui.secondaryText}>Receiver: {cargo.receiverContact || cargo.receiverName}</span>
                      <a href={`tel:${cargo.receiverPhone}`} onClick={(e) => e.stopPropagation()} className={styles.call}>
                        <FontAwesomeIcon icon={faPhone} /> Call
                      </a>
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className={styles.mapArea}>
        <TrackMap
          cargoId={selected?.id}
          route={route}
          fromTruck={fromTruck}
          positions={mapPositions}
          labels={mapLabels}
          selectedTruckId={selectedTruck?.id}
          onSelectTruck={selectTruck}
          fleetRoutes={fleetRoutes}
        />
        {selected && (
          <div className={styles.overlay}>
            <span className={ui.secondaryText}>{shipmentRef(selected.id)}</span>
            <strong>
              {selected.pickupLocation} → {selected.deliveryLocation}
            </strong>
            {routing && !route && <span className={ui.secondaryText}>Calculating route…</span>}
            {approachLeg && (
              <span className={styles.overlayLeg}>
                <span className={styles.legendApproach} />
                {selectedTruck?.truckNumber} to pickup: {formatDistance(approachLeg.distanceM)} · about{" "}
                {formatDuration(approachLeg.durationS)}
              </span>
            )}
            {onwardLeg && (
              <span className={styles.overlayLeg}>
                <span className={styles.legendRoute} />
                {fromTruck && route?.pickedUp ? `${selectedTruck?.truckNumber} to delivery` : "Pickup → delivery"}:{" "}
                {formatDistance(onwardLeg.distanceM)} · about {formatDuration(onwardLeg.durationS)}
              </span>
            )}
            {queuedAfter && (
              <span className={ui.secondaryText}>
                {selectedTruck?.truckNumber} picks this up after {shipmentRef(queuedAfter.id)} ({queuedAfter.pickupLocation} →{" "}
                {queuedAfter.deliveryLocation})
              </span>
            )}
            {selected && unroutableFrom.has(selected.id) && (
              <span className={ui.secondaryText}>
                No road route from {selectedTruck?.truckNumber ?? "the truck"}'s position; showing pickup → delivery
              </span>
            )}
            {isError && !from && !routing && <span className={ui.secondaryText}>Route unavailable for this shipment</span>}
            {selected && !selected.truckId && <span className={ui.secondaryText}>No truck assigned yet</span>}
            {selectedPosition && (
              <span className={ui.secondaryText}>Truck position updated {formatAge(selectedPosition.recordedAt)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OngoingDelivery;
