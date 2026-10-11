import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationCrosshairs, faTrash } from "@fortawesome/free-solid-svg-icons";

import type { RoadReport } from "../../app/api/community";
import { formatAge } from "../../utils/format";
import { cx } from "../ui/helpers";
import { REPORT_TYPES } from "./reportTypes";

import shared from "./driver.module.css";
import styles from "./ReportListItem.module.css";
import { formatDistance } from "../../utils/units";

const expiresIn = (iso: string) => {
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
};

/** One road report in a list: icon, label, note, who posted it and when it expires. */
const ReportListItem = ({
  report,
  km,
  reporterName = report.reporter.name,
  focused,
  onFocus,
  onRemove,
  removeLabel = "Remove report",
}: {
  report: RoadReport;
  /** Distance from the viewer's truck, when known. */
  km?: number;
  reporterName?: string;
  focused?: boolean;
  onFocus: () => void;
  /** Shows a remove button when given. */
  onRemove?: () => void;
  removeLabel?: string;
}) => {
  const meta = REPORT_TYPES[report.type] ?? REPORT_TYPES.hazard;
  return (
    <li className={cx(styles.reportRow, focused && styles.reportFocused)}>
      <button className={styles.reportItem} onClick={onFocus}>
        <span className={shared.reportIcon} style={{ background: meta.color }}>
          <FontAwesomeIcon icon={meta.icon} />
        </span>
        <span className={styles.reportText}>
          <span className={styles.reportTitle}>
            <strong>{report.label}</strong>
            {km !== undefined && (
              <span className={styles.distance}>
                <FontAwesomeIcon icon={faLocationCrosshairs} />
                {km < 1 ? "here" : formatDistance(km * 1000)}
              </span>
            )}
          </span>
          {report.note && <span>{report.note}</span>}
          <span className={shared.muted}>
            {reporterName}
            {report.reporter.truckNumber && ` · ${report.reporter.truckNumber}`} · {formatAge(report.createdAt)} · expires in{" "}
            {expiresIn(report.expiresAt)}
          </span>
        </span>
      </button>
      {onRemove && (
        <button className={styles.iconAction} onClick={onRemove} aria-label={removeLabel} title={removeLabel}>
          <FontAwesomeIcon icon={faTrash} />
        </button>
      )}
    </li>
  );
};

export default ReportListItem;
