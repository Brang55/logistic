import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBullhorn } from "@fortawesome/free-solid-svg-icons";

import {
  useCreateRoadReportMutation,
  useDeleteRoadReportMutation,
  type ReportType,
} from "../../app/api/community";
import { cx } from "../ui/helpers";
import { REPORT_TYPE_KEYS, REPORT_TYPES } from "./reportTypes";
import type { ToastMessage } from "./useToast";

import shared from "./driver.module.css";
import styles from "./QuickReports.module.css";
import { errorMessage } from "../../utils/errors";

interface Props {
  onToast: (text: string, action?: ToastMessage["action"]) => void;
}

/**
 * One tap drops a report at the truck's current position for every driver to see.
 * A mistaken tap is taken back with Undo on the confirmation toast.
 */
const QuickReports = ({ onToast }: Props) => {
  const [createReport] = useCreateRoadReportMutation();
  const [deleteReport] = useDeleteRoadReportMutation();
  const [sending, setSending] = useState<ReportType>();
  const [error, setError] = useState("");

  const report = async (type: ReportType) => {
    setError("");
    setSending(type);
    const result = await createReport({ type });
    setSending(undefined);
    if ("error" in result) return setError(errorMessage(result.error));
    onToast(`${REPORT_TYPES[type].label} reported at your position. Thanks!`, {
      label: "Undo",
      run: () => void deleteReport(result.data.id),
    });
  };

  return (
    <section className={shared.card}>
      <div className={shared.cardHeader}>
        <h2>
          <FontAwesomeIcon icon={faBullhorn} /> Report on the road
        </h2>
        <span className={shared.ref}>One tap · shared with all drivers</span>
      </div>
      <div className={styles.reportGrid}>
        {REPORT_TYPE_KEYS.map((type) => {
          const meta = REPORT_TYPES[type];
          return (
            <button
              key={type}
              className={cx(styles.reportButton, sending === type && styles.reportButtonBusy)}
              onClick={() => report(type)}
              disabled={sending !== undefined}
            >
              <span className={shared.reportIcon} style={{ background: meta.color }}>
                <FontAwesomeIcon icon={meta.icon} />
              </span>
              {meta.label}
            </button>
          );
        })}
      </div>
      {error && <p className={shared.formError}>{error}</p>}
    </section>
  );
};

export default QuickReports;
