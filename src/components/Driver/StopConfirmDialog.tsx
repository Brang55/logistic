import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faFlagCheckered, faTriangleExclamation, faWarehouse } from "@fortawesome/free-solid-svg-icons";

import type Cargo from "../../app/features/driver/cargoSlice";
import type { Stop } from "../../app/features/driver/tripsSlice";
import { Modal } from "../ui/ui";
import { cx, shipmentRef } from "../ui/helpers";
import ui from "../ui/ui.module.css";
import { formatWeight } from "./driverFormat";

import styles from "./DriverTrip.module.css";
import { formatDistance } from "../../utils/units";

// Further than this from the stop, the dialog warns that the truck doesn't seem to be there.
const FAR_FROM_STOP_KM = 2;

const CHECKS = {
  pickup: ["The goods are loaded and secured", "Quantity and weight match the papers", "The CMR / bill of lading is signed"],
  delivery: ["The goods are unloaded", "The receiver has signed the CMR / proof of delivery", "Any damage or shortage is written on the papers"],
};

interface Props {
  stop: Stop;
  cargo: Cargo;
  /** Straight-line distance from the truck to the stop, when the truck's position is known. */
  distanceKm?: number;
  busy: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks the driver to confirm a pickup or delivery before it is recorded. */
const StopConfirmDialog = ({ stop, cargo, distanceKm, busy, error, onConfirm, onCancel }: Props) => {
  const isPickup = stop.kind === "pickup";
  const far = distanceKm !== undefined && distanceKm > FAR_FROM_STOP_KM;

  return (
    <Modal
      small
      title={isPickup ? "Confirm pickup" : "Confirm delivery"}
      onClose={onCancel}
      footer={
        <div className={styles.dialogButtons}>
          <button className={cx(ui.btn, ui.secondary)} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className={cx(ui.btn, ui.primary)} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? "Saving..." : isPickup ? "Yes, goods are loaded" : "Yes, goods are delivered"}
          </button>
        </div>
      }
    >
      <div className={styles.dialogStop}>
        <span className={cx(styles.stopIcon, isPickup ? styles.stopIconPickup : styles.stopIconDelivery)}>
          <FontAwesomeIcon icon={isPickup ? faWarehouse : faFlagCheckered} />
        </span>
        <span>
          <strong>{stop.name}</strong>
          <span className={styles.dialogMeta}>
            {shipmentRef(cargo.id)} · {cargo.descriptionOfGoods || "Cargo"}
            {cargo.weight && ` · ${formatWeight(cargo.weight)}`}
          </span>
        </span>
      </div>

      <p className={styles.dialogLead}>Before you confirm, make sure that:</p>
      <ul className={styles.checklist}>
        {CHECKS[stop.kind].map((check) => (
          <li key={check}>
            <FontAwesomeIcon icon={faCircleCheck} />
            {check}
          </li>
        ))}
      </ul>

      {far && (
        <div className={styles.dialogWarning}>
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>
            Your truck is about <strong>{formatDistance(distanceKm! * 1000)}</strong> from {stop.name}. Only
            confirm if you are really there.
          </span>
        </div>
      )}
      {error && <div className={cx(ui.alert, ui.alertError, styles.dialogError)}>{error}</div>}
      <p className={styles.dialogNote}>Your dispatcher is notified straight away. This can't be undone from the app.</p>
    </Modal>
  );
};

export default StopConfirmDialog;
