import { Link } from "react-router-dom";

import { useFetchCargosQuery } from "../../app/features/driver/cargoSlice";
import { useLatestPositionsQuery } from "../../app/features/driver/telematicsSlice";
import { useAlertsQuery } from "../../app/features/driver/tripsSlice";
import { useFetchTrucksQuery } from "../../app/features/driver/truckSlice";
import { formatAge } from "../../utils/format";
import { Loader } from "../Loader/Loader";

import styles from "./Dashboard.module.css";

const FINISHED = ["delivered", "cancelled"];
// Positions older than this count as offline (matches the Live Fleet page).
const OFFLINE_AFTER_MS = 30 * 60 * 1000;

const Stat = ({ label, value, to, tone }: { label: string; value: number; to: string; tone?: "warn" | "good" }) => (
  <Link to={to} className={`${styles.stat} ${tone ? styles[tone] : ""}`}>
    <span className={styles.value}>{value}</span>
    <span className={styles.label}>{label}</span>
  </Link>
);

const Dashboard = () => {
  const { data: trucks, isLoading: trucksLoading } = useFetchTrucksQuery();
  const { data: cargos, isLoading: cargosLoading } = useFetchCargosQuery();
  // Subscribing here also keeps cargo data live via the shared socket.
  const { data: positions } = useLatestPositionsQuery();
  const { data: alerts } = useAlertsQuery();

  if (trucksLoading || cargosLoading) return <Loader />;

  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const online = (positions ?? []).filter((p) => now - new Date(p.recordedAt).getTime() < OFFLINE_AFTER_MS);
  const moving = online.filter((p) => (p.speedKmh ?? 0) > 0).length;
  const active = (cargos ?? []).filter((c) => !FINISHED.includes(c.status));
  const unassigned = active.filter((c) => !c.truckId).sort((a, b) => a.pickupDate.localeCompare(b.pickupDate));
  const inTransit = active.filter((c) => c.status === "picked_up").length;
  const delayed = active.filter((c) => c.delayMinutes).length;
  const deliveredToday = (cargos ?? []).filter((c) => c.deliveredAt?.slice(0, 10) === today).length;
  const freeTrucks = (trucks ?? []).filter((t) => t.status === "available").length;

  return (
    <div className={styles.dashboard}>
      <h3 className={styles.title}>Today</h3>
      <div className={styles.stats}>
        <Stat label="Trucks on the road" value={moving} to="/fleet" tone="good" />
        <Stat label="Free trucks" value={freeTrucks} to="/fleet" />
        <Stat label="Loads waiting for a truck" value={unassigned.length} to="/dispatcher" tone={unassigned.length ? "warn" : undefined} />
        <Stat label="In transit" value={inTransit} to="/traffic" />
        <Stat label="Reported delays" value={delayed} to="/traffic" tone={delayed ? "warn" : undefined} />
        <Stat label="Delivered today" value={deliveredToday} to="/cargoList" tone="good" />
      </div>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <h4>Needs attention</h4>
          {!alerts?.length && <p className={styles.muted}>No alerts. Delays, traffic problems and imported loads show up here live.</p>}
          <ul>
            {alerts?.slice(0, 8).map((alert) => (
              <li key={alert.id} className={`${styles.alert} ${styles[alert.severity]}`}>
                <span>{alert.message}</span>
                <span className={styles.muted}>{formatAge(alert.createdAt, now)}</span>
              </li>
            ))}
          </ul>
          <Link to="/traffic" className={styles.more}>
            Open traffic →
          </Link>
        </section>

        <section className={styles.panel}>
          <h4>Next loads to assign</h4>
          {!unassigned.length && <p className={styles.muted}>Every load has a truck.</p>}
          <ul>
            {unassigned.slice(0, 8).map((cargo) => (
              <li key={cargo.id} className={styles.load}>
                <span>
                  {cargo.pickupLocation} → {cargo.deliveryLocation}
                </span>
                <span className={styles.muted}>
                  pickup {cargo.pickupDate} · {cargo.shipperName}
                </span>
              </li>
            ))}
          </ul>
          <Link to="/dispatcher" className={styles.more}>
            Open dispatch →
          </Link>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
