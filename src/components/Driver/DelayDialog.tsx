import { FormEvent, useState } from "react";

import { useReportDelayMutation } from "../../app/api/trips";
import { Modal } from "../ui/ui";
import { cx } from "../ui/helpers";
import ui from "../ui/ui.module.css";

import styles from "./DriverTrip.module.css";
import { errorMessage } from "../../utils/errors";

const MINUTES = [15, 30, 45, 60, 90, 120];
const REASONS = ["Heavy traffic", "Road works", "Loading took longer", "Border crossing", "Rest break", "Bad weather"];

interface Props {
  cargoId: string;
  onClose: () => void;
  onSent: (message: string) => void;
}

/** Tells the dispatcher the driver will be late to the next stop. */
const DelayDialog = ({ cargoId, onClose, onSent }: Props) => {
  const [reportDelay, sending] = useReportDelayMutation();
  const [minutes, setMinutes] = useState(30);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await reportDelay({ cargoId, minutes, reason: reason.trim() });
    if ("error" in result) return setError(errorMessage(result.error));
    onSent(`Dispatcher notified: ${minutes} min delay.`);
    onClose();
  };

  return (
    <Modal
      small
      title="Report a delay"
      onClose={onClose}
      footer={
        <div className={styles.dialogButtons}>
          <button className={cx(ui.btn, ui.secondary)} onClick={onClose}>
            Cancel
          </button>
          <button className={cx(ui.btn, ui.primary)} type="submit" form="delay-form" disabled={sending.isLoading}>
            {sending.isLoading ? "Sending..." : "Send to dispatcher"}
          </button>
        </div>
      }
    >
      <form id="delay-form" className={styles.delayForm} onSubmit={submit}>
        {error && <div className={cx(ui.alert, ui.alertError)}>{error}</div>}
        <fieldset className={styles.fieldset}>
          <legend className={ui.label}>How late will you be?</legend>
          <div className={styles.choiceGrid}>
            {MINUTES.map((value) => (
              <button
                key={value}
                type="button"
                className={cx(styles.choice, minutes === value && styles.choiceActive)}
                aria-pressed={minutes === value}
                onClick={() => setMinutes(value)}
              >
                {value < 60 ? `${value} min` : `${Math.floor(value / 60)} h${value % 60 ? ` ${value % 60} min` : ""}`}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className={styles.fieldset}>
          <legend className={ui.label}>Reason</legend>
          <div className={styles.reasonChips}>
            {REASONS.map((value) => (
              <button
                key={value}
                type="button"
                className={cx(styles.chip, reason === value && styles.choiceActive)}
                aria-pressed={reason === value}
                onClick={() => setReason(reason === value ? "" : value)}
              >
                {value}
              </button>
            ))}
          </div>
          <input
            className={ui.input}
            placeholder="Or describe it (optional)"
            value={reason}
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
          />
        </fieldset>
      </form>
    </Modal>
  );
};

export default DelayDialog;
