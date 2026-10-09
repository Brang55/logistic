import { useEffect, useRef, useState } from "react";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import {
  useMarkDeliveredMutation,
  useMarkPickedUpMutation,
  useMyTripQuery,
  useReportDelayMutation,
  type MyTrip,
} from "../../app/features/driver/tripsSlice";
import { formatAge, formatDistance, formatDuration } from "../../utils/format";
import { groupMessages } from "../../utils/notices";
import { Loader } from "../Loader/Loader";
import VoiceAssistant from "./VoiceAssistant";

import styles from "./DriverTrip.module.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

const REFRESH_MS = 15_000;
const DELAY_OPTIONS = [15, 30, 45, 60, 90, 120];
const CONFIRM_WINDOW_MS = 4000;

type Trip = NonNullable<MyTrip["trip"]>;

const errorMessage = (error: unknown) =>
  (error as { data?: { message?: string } } | undefined)?.data?.message ?? "Something went wrong. Try again.";

/** Needs a second tap within a few seconds, so a stray touch doesn't record an arrival. */
const ConfirmButton = ({ label, onConfirm, busy }: { label: string; onConfirm: () => void; busy: boolean }) => {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      className={`${styles.primary} ${armed ? styles.armed : ""}`}
      disabled={busy}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {busy ? "Saving..." : armed ? "Tap again to confirm" : label}
    </button>
  );
};

const TripMap = ({ trip }: { trip: Trip }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<mapboxgl.Map>();

  useEffect(() => {
    if (!containerRef.current) return;
    const mapInstance = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: trip.position?.point ?? trip.nextStop.point,
      zoom: 9,
    });
    mapInstance.on("load", () => {
      mapInstance.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      mapInstance.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#5932ea", "line-width": 6 },
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
      new mapboxgl.Marker({ color: stop.kind === "pickup" ? "#2e7d32" : "#c62828" }).setLngLat(stop.point).addTo(map)
    );
    if (position) {
      const el = document.createElement("div");
      el.className = styles.truckMarker;
      markers.push(new mapboxgl.Marker({ element: el }).setLngLat(position).addTo(map));
    }
    return () => markers.forEach((marker) => marker.remove());
  }, [map, route, position, trip.stops]);

  // Frame the way to the next stop whenever the stop changes.
  const nextStopKey = `${trip.nextStop.cargoId}:${trip.nextStop.kind}`;
  useEffect(() => {
    if (!map) return;
    const bounds = new mapboxgl.LngLatBounds(trip.nextStop.point, trip.nextStop.point);
    if (position) bounds.extend(position);
    map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, nextStopKey]);

  return <div ref={containerRef} className={styles.map} />;
};

const DriverTrip = () => {
  const { data, isLoading, error } = useMyTripQuery(undefined, { pollingInterval: REFRESH_MS });
  const [markPickedUp, pickup] = useMarkPickedUpMutation();
  const [markDelivered, delivery] = useMarkDeliveredMutation();
  const [reportDelay, delay] = useReportDelayMutation();
  const [delayMinutes, setDelayMinutes] = useState(30);
  const [delayReason, setDelayReason] = useState("");
  const [delaySent, setDelaySent] = useState(false);

  if (isLoading) return <Loader />;
  if (error || !data) return <p className={styles.page}>{errorMessage(error)}</p>;

  const { driver, trip } = data;
  if (!trip) {
    return (
      <div className={styles.page}>
        <h2>Hi {driver.firstName}</h2>
        <p className={styles.card}>No load assigned right now. Your dispatcher will send your next one here.</p>
      </div>
    );
  }

  const { cargo, nextStop, route } = trip;
  const isPickup = nextStop.kind === "pickup";
  // The first leg runs from the truck to the next stop when the position is known.
  const toNextStop = trip.position ? route?.legs[0] : undefined;
  const contact = isPickup
    ? { name: cargo.contactPerson || cargo.shipperName, phone: cargo.phoneNumber }
    : { name: cargo.receiverContact || cargo.receiverName, phone: cargo.receiverPhone };
  const violations = route?.notices.filter((notice) => notice.type === "violation") ?? [];
  const actionError = pickup.error ?? delivery.error;

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <span className={`${styles.badge} ${isPickup ? styles.pickup : styles.delivery}`}>
          {isPickup ? "Next: pickup" : "Next: delivery"}
        </span>
        <h2 className={styles.stop}>{nextStop.name}</h2>
        {toNextStop && (
          <p className={styles.eta}>
            {formatDuration(toNextStop.durationS)} · {formatDistance(toNextStop.distanceM)} · ETA{" "}
            {new Date(Date.now() + toNextStop.durationS * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
        <p className={styles.muted}>
          {cargo.descriptionOfGoods} {cargo.weight && `· ${cargo.weight} kg`} · truck {trip.truck.truckNumber}
        </p>
        {contact.name && (
          <p>
            {contact.name}
            {contact.phone && (
              <>
                {" · "}
                <a href={`tel:${contact.phone}`}>{contact.phone}</a>
              </>
            )}
          </p>
        )}

        <ConfirmButton
          label={isPickup ? "Confirm pickup" : "Confirm delivery"}
          busy={pickup.isLoading || delivery.isLoading}
          onConfirm={() => (isPickup ? markPickedUp(cargo.id) : markDelivered(cargo.id))}
        />
        {actionError && <p className={styles.error}>{errorMessage(actionError)}</p>}
      </section>

      <VoiceAssistant />

      {violations.length > 0 && (
        <section className={`${styles.card} ${styles.warning}`}>
          <h3>Truck restrictions on this route</h3>
          <ul>
            {groupMessages(violations.map((notice) => notice.message)).map(({ message, count }) => (
              <li key={message}>
                {message}
                {count > 1 && ` (${count} places)`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <TripMap trip={trip} />

      <section className={styles.card}>
        <h3>Report a delay</h3>
        {cargo.delayMinutes && (
          <p className={styles.muted}>
            Last reported: {cargo.delayMinutes} min{cargo.delayReason && ` – ${cargo.delayReason}`}
          </p>
        )}
        <div className={styles.delayRow}>
          <select value={delayMinutes} onChange={(e) => setDelayMinutes(Number(e.target.value))}>
            {DELAY_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} min
              </option>
            ))}
          </select>
          <input
            placeholder="Reason (optional)"
            value={delayReason}
            maxLength={200}
            onChange={(e) => setDelayReason(e.target.value)}
          />
        </div>
        <button
          className={styles.secondary}
          disabled={delay.isLoading}
          onClick={async () => {
            const result = await reportDelay({ cargoId: cargo.id, minutes: delayMinutes, reason: delayReason });
            if (!("error" in result)) {
              setDelaySent(true);
              setDelayReason("");
            }
          }}
        >
          {delay.isLoading ? "Sending..." : "Send to dispatcher"}
        </button>
        {delaySent && !delay.isLoading && !delay.error && <p className={styles.muted}>Dispatcher notified.</p>}
        {delay.error && <p className={styles.error}>{errorMessage(delay.error)}</p>}
      </section>

      {route && route.steps.length > 0 && (
        <details className={styles.card}>
          <summary>Directions ({route.steps.length} steps)</summary>
          <ol className={styles.steps}>
            {route.steps.map((step, index) => (
              <li key={index}>
                {step.instruction} <span className={styles.muted}>{formatDistance(step.distanceM)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {trip.queue.length > 0 && (
        <section className={styles.card}>
          <h3>Next loads</h3>
          <ul>
            {trip.queue.map((next) => (
              <li key={next.id}>
                {next.pickupLocation} → {next.deliveryLocation}{" "}
                <span className={styles.muted}>pickup {next.pickupDate}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {trip.position && (
        <p className={styles.muted}>Truck position updated {formatAge(trip.position.recordedAt)}.</p>
      )}
    </div>
  );
};

export default DriverTrip;
