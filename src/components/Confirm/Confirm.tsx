import { Backdrop } from "../Backdrop/Backdrop";

import styles from "./Confirm.module.css";

interface ConfirmProps {
  show: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  driverName?: string | undefined;
  driverLastName?: string | undefined;
  truckName?: string | undefined;
  truckNumber?: string | undefined;
  status?: string | undefined;
}

export const Confirm: React.FC<ConfirmProps> = ({
  show,
  onCancel,
  onConfirm,
  driverName,
  driverLastName,
}) => {
  return (
    <>
      <div className={styles.confirmationDialog}>
        <p>
          Please confirm that you would like to delete {driverName}{" "}
          {driverLastName}
        </p>
        <div className={styles.buttonHolder}>
          <button onClick={onConfirm}>Confirm</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
      <Backdrop show={show} onClick={onCancel} />
    </>
  );
};
