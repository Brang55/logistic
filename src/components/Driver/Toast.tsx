import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";

import type { ToastMessage } from "./useToast";

import styles from "./Toast.module.css";

export const Toast = ({ toast, onDismiss }: { toast?: ToastMessage; onDismiss: () => void }) =>
  toast ? (
    <div className={styles.toast} role="status">
      <FontAwesomeIcon icon={faCircleCheck} />
      <span>{toast.text}</span>
      {toast.action && (
        <button
          className={styles.toastAction}
          onClick={() => {
            toast.action!.run();
            onDismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  ) : null;
