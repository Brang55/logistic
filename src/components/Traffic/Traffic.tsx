import {
  useAlertsQuery,
  useTrafficReportQuery,
  type TripTraffic,
} from "../../app/features/driver/tripsSlice";
import { formatAge, formatDistance, formatDuration } from "../../utils/format";
import { Loader } from "../Loader/Loader";

import styles from "./Traffic.module.css";

// Refresh the report on the same cadence as the server's traffic monitor.
const REFRESH_MS = 5 * 60_000;

const delayClass = (seconds: number) =>
  seconds >= 30 * 60 ? styles.bad : seconds >= 10 * 60 ? styles.slow : styles.ok;

const TripRow = ({ trip }: { trip: TripTraffic }) => (
  <li className={styles.trip}>
    <div className={styles.tripHeader}>
      <strong>{trip.truckNumber}</strong>
      <span className={`${styles.pill} ${delayClass(trip.trafficDelayS)}`}>
        {trip.trafficDelayS >= 60 ? `+${formatDuration(trip.trafficDelayS)} traffic` : "Traffic normal"}
      </span>
    </div>
    <p className={styles.muted}>{trip.cargo}</p>
    <p>
      {trip.nextStop.kind === "pickup" ? "Pickup" : "Delivery"} at <strong>{trip.nextStop.name}</strong>
      {trip.etaAt && trip.remainingS !== null && trip.remainingM !== null && (
        <>
          {" "}
          · {formatDuration(trip.remainingS)} · {formatDistance(trip.remainingM)} · ETA{" "}
          {new Date(trip.etaAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
        </>
      )}
    </p>
    {trip.reportedDelay && (
      <p className={styles.reported}>
        Driver reported {trip.reportedDelay.minutes} min delay
        {trip.reportedDelay.reason && ` – ${trip.reportedDelay.reason}`} ({formatAge(trip.reportedDelay.at)})
      </p>
    )}
    {trip.violations.length > 0 && (
      <p className={styles.bad}>{trip.violations.length} truck restriction(s) on the remaining route</p>
    )}
    {trip.incidents.length > 0 && (
      <details>
        <summary>{trip.incidents.length} incidents on the way</summary>
        <ul>
          {trip.incidents.map((incident) => (
            <li key={incident.id}>
              <span className={styles.impact}>{incident.impact}</span> {incident.description}
              {incident.closed && " (road closed)"}
            </li>
          ))}
        </ul>
      </details>
    )}
  </li>
);

const Traffic = () => {
  const { data: report, isLoading, isFetching, refetch } = useTrafficReportQuery(undefined, {
    pollingInterval: REFRESH_MS,
  });
  const { data: alerts } = useAlertsQuery();

  // Worst traffic first.
  const trips = [...(report?.trips ?? [])].sort((a, b) => b.trafficDelayS - a.trafficDelayS);

  return (
    <div className={styles.traffic}>
      <section className={styles.trips}>
        <div className={styles.header}>
          <h3>Traffic on active trips</h3>
          <button className={styles.refresh} onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Checking..." : "Refresh"}
          </button>
        </div>
        {report && <p className={styles.muted}>Checked {formatAge(report.checkedAt)} against live traffic.</p>}
        {isLoading && <Loader />}
        {report && trips.length === 0 && <p>No trucks are on a trip right now.</p>}
        <ul>
          {trips.map((trip) => (
            <TripRow key={trip.cargoId} trip={trip} />
          ))}
        </ul>
      </section>
      <aside className={styles.alerts}>
        <h3>Alerts</h3>
        {alerts?.length === 0 && <p className={styles.muted}>No alerts yet. New ones appear here live.</p>}
        <ul>
          {alerts?.map((alert) => (
            <li key={alert.id} className={`${styles.alert} ${styles[alert.severity]}`}>
              <span>{alert.message}</span>
              <span className={styles.muted}>{formatAge(alert.createdAt)}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
};

export default Traffic;
