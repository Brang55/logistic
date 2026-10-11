import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRoad } from "@fortawesome/free-solid-svg-icons";

import {
  useDeleteRoadReportMutation,
  useRoadReportsQuery,
  type RoadReport,
} from "../../app/features/driver/communitySlice";
import {
  useAlertsQuery,
  useTrafficReportQuery,
  type TripTraffic,
} from "../../app/features/driver/tripsSlice";
import { formatAge, formatDistance, formatDuration } from "../../utils/format";
import { Loader } from "../Loader/Loader";
import ReportListItem from "../Driver/ReportListItem";
import ReportsMap from "../Driver/ReportsMap";
import { REPORT_TYPES } from "../Driver/reportTypes";
import { ConfirmDialog, EmptyState, PageHeader } from "../ui/ui";
import { cx } from "../ui/helpers";
import ui from "../ui/ui.module.css";

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
      <p className={styles.bad}>
        {trip.violations.length} truck restriction(s) on the remaining route
        {trip.restrictionsAccepted ? " · accepted by dispatch" : " · not approved"}
      </p>
    )}
    {trip.roadReports.length > 0 && (
      <details open>
        <summary className={styles.reportsSummary}>
          {trip.roadReports.length} driver {trip.roadReports.length === 1 ? "report" : "reports"} on the way
        </summary>
        <ul>
          {trip.roadReports.map((report) => {
            const meta = REPORT_TYPES[report.type] ?? REPORT_TYPES.hazard;
            return (
              <li key={report.id} className={styles.routeReport}>
                <span className={styles.routeReportIcon} style={{ background: meta.color }}>
                  <FontAwesomeIcon icon={meta.icon} />
                </span>
                <span>
                  <strong>{report.label}</strong>
                  {report.note && ` – ${report.note}`} <span className={styles.muted}>· {formatAge(report.createdAt)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </details>
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
  const { data: roadReports } = useRoadReportsQuery();
  const [deleteReport, deleting] = useDeleteRoadReportMutation();
  const [focusId, setFocusId] = useState<string>();
  const [removing, setRemoving] = useState<RoadReport>();
  const reports = roadReports?.reports ?? [];

  // Worst traffic first.
  const trips = [...(report?.trips ?? [])].sort((a, b) => b.trafficDelayS - a.trafficDelayS);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Traffic"
        subtitle={
          report
            ? `Live traffic on active trips (checked ${formatAge(report.checkedAt)}) and warnings reported by drivers`
            : "Live traffic on active trips and warnings reported by drivers"
        }
        actions={
          <button className={cx(ui.btn, ui.primary)} onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Checking..." : "Refresh"}
          </button>
        }
      />
      <section className={cx(ui.card, styles.reports)}>
        <div className={styles.reportsHeader}>
          <div>
            <h2 className={styles.sectionTitle}>
              <FontAwesomeIcon icon={faRoad} /> Driver road reports
            </h2>
            <p className={styles.muted}>
              Police, accidents, road works and more, posted by your drivers from the road. Reports on an active trip's
              route are also listed under that trip and raise an alert.
            </p>
          </div>
          <span className={styles.liveCount}>
            <span className={styles.liveDot} /> {reports.length} active
          </span>
        </div>
        <div className={styles.reportsBody}>
          <div className={styles.reportsList}>
            {reports.length === 0 ? (
              <EmptyState icon={faRoad} title="No active driver reports" text="New reports from drivers appear here live." />
            ) : (
              <ul className={styles.reportItems}>
                {reports.map((r) => (
                  <ReportListItem
                    key={r.id}
                    report={r}
                    focused={focusId === r.id}
                    onFocus={() => setFocusId(r.id)}
                    onRemove={() => setRemoving(r)}
                  />
                ))}
              </ul>
            )}
          </div>
          <div className={styles.reportsMap}>
            <ReportsMap reports={reports} position={null} focusId={focusId} />
          </div>
        </div>
      </section>
      <div className={styles.traffic}>
        <section className={styles.trips}>
          <h2 className={styles.sectionTitle}>Active trips</h2>
          {isLoading && <Loader />}
          {report && trips.length === 0 && <p>No trucks are on a trip right now.</p>}
          <ul>
            {trips.map((trip) => (
              <TripRow key={trip.cargoId} trip={trip} />
            ))}
          </ul>
        </section>
        <aside className={styles.alerts}>
          <h2 className={styles.sectionTitle}>Alerts</h2>
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

      {removing && (
        <ConfirmDialog
          title="Remove this report?"
          message={`"${removing.label}" from ${removing.reporter.name} will disappear for all drivers and dispatchers.`}
          confirmLabel="Remove"
          danger
          busy={deleting.isLoading}
          onCancel={() => setRemoving(undefined)}
          onConfirm={async () => {
            await deleteReport(removing.id);
            setRemoving(undefined);
          }}
        />
      )}
    </div>
  );
};

export default Traffic;
