import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRoad } from "@fortawesome/free-solid-svg-icons";

import {
  useDeleteRoadReportMutation,
  useRoadReportsQuery,
  type RoadReport,
} from "../../app/api/community";
import { useMyTripQuery } from "../../app/api/trips";
import { distanceKm } from "../../utils/geo";
import { Loader } from "../Loader/Loader";
import { ConfirmDialog, PageHeader } from "../ui/ui";
import { cx } from "../ui/helpers";
import QuickReports from "./QuickReports";
import ReportListItem from "./ReportListItem";
import ReportsMap from "./ReportsMap";
import { Toast } from "./Toast";
import { useMediaQuery, WIDE_QUERY } from "./useMediaQuery";
import { useToast } from "./useToast";

import styles from "./DriverTrip.module.css";
import { milesToKm } from "../../utils/units";

// "Nearby" covers roughly the next couple of hours of driving.
const NEARBY_MI = 100;
const NEARBY_KM = milesToKm(NEARBY_MI);

type Scope = "nearby" | "all";

const RoadReports = () => {
  const { data, isLoading } = useRoadReportsQuery();
  const { data: me } = useMyTripQuery();
  const [deleteReport, deleting] = useDeleteRoadReportMutation();
  const { toast, show: showToast, dismiss } = useToast();
  const wide = useMediaQuery(WIDE_QUERY);
  const [scope, setScope] = useState<Scope>("nearby");
  const [focusId, setFocusId] = useState<string>();
  const [removing, setRemoving] = useState<RoadReport>();

  const position = data?.position ?? null;
  const withDistance = useMemo(
    () =>
      (data?.reports ?? [])
        .map((report) => ({ report, km: position ? distanceKm(position, report.point) : undefined }))
        .sort((a, b) => (a.km ?? 0) - (b.km ?? 0) || b.report.createdAt.localeCompare(a.report.createdAt)),
    [data, position]
  );
  const nearbyCount = withDistance.filter(({ km }) => km !== undefined && km <= NEARBY_KM).length;
  // Without a known position there's nothing to be near, so everything is shown.
  const effectiveScope: Scope = position ? scope : "all";
  const visible = effectiveScope === "nearby" ? withDistance.filter(({ km }) => km! <= NEARBY_KM) : withDistance;

  if (isLoading) return <Loader />;

  const map = <ReportsMap reports={data?.reports ?? []} position={position} focusId={focusId} />;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Community"
        title="Road reports"
        subtitle="Warnings from drivers on the road, shared live with everyone"
        actions={
          <span className={styles.equipmentChip}>
            <span className={styles.liveDot} /> {data?.reports.length ?? 0} active reports
          </span>
        }
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          <QuickReports onToast={showToast} />

          {!wide && <div className={styles.mapInline}>{map}</div>}

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>
                <FontAwesomeIcon icon={faRoad} /> Reports from drivers
              </h2>
              {position && (
                <div className={styles.segmented} role="tablist">
                  {(
                    [
                      ["nearby", `Nearby (${nearbyCount})`],
                      ["all", `All (${withDistance.length})`],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      role="tab"
                      aria-selected={scope === value}
                      className={cx(styles.segment, scope === value && styles.segmentActive)}
                      onClick={() => setScope(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {visible.length === 0 ? (
              <p className={cx(styles.muted, styles.emptyList)}>
                {effectiveScope === "nearby"
                  ? `Nothing reported within ${NEARBY_MI} mi of your truck.`
                  : "No reports right now. Use the buttons above to warn other drivers."}
              </p>
            ) : (
              <ul className={styles.reportList}>
                {visible.map(({ report, km }) => {
                  const mine = report.reporter.driverId === me?.driver.id;
                  return (
                    <ReportListItem
                      key={report.id}
                      report={report}
                      km={km}
                      reporterName={mine ? "You" : report.reporter.name}
                      focused={focusId === report.id}
                      onFocus={() => setFocusId(report.id)}
                      onRemove={mine ? () => setRemoving(report) : undefined}
                      removeLabel="Remove my report"
                    />
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {wide && <aside className={styles.mapColumn}>{map}</aside>}
      </div>

      {removing && (
        <ConfirmDialog
          title="Remove your report?"
          message={`Other drivers will no longer see "${removing.label}" on the map.`}
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
      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
};

export default RoadReports;
