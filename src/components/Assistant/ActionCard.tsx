import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

import type { ProposedAction, UiAction } from "../../app/api/assistant";
import { cx } from "../ui/helpers";
import ui from "../ui/ui.module.css";
import type { ActionState } from "./useAssistantChat";

import styles from "./Assistant.module.css";

/** A change the assistant proposed, with Confirm and Cancel; afterwards, what happened. */
const ActionCard = ({
  action,
  state,
  busy,
  large,
  onConfirm,
  onCancel,
  onOpen,
}: {
  action: ProposedAction;
  state: ActionState;
  busy: boolean;
  /** Bigger buttons, for drivers in the cab. */
  large?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onOpen: (link: UiAction) => void;
}) => (
  <div className={cx(styles.action, state.status !== "pending" && styles.actionDone)}>
    <p className={styles.actionTitle}>{action.title}</p>
    <p className={styles.actionSummary}>{action.summary}</p>
    {action.details.length > 0 && (
      <ul className={styles.actionDetails}>
        {action.details.map((detail) => (
          <li key={detail}>{detail}</li>
        ))}
      </ul>
    )}
    {state.status === "pending" &&
      action.warnings.map((warning) => (
        <div key={warning} className={styles.actionWarning}>
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>{warning}</span>
        </div>
      ))}

    {state.status === "pending" && (
      <>
        {state.error && <p className={styles.actionError}>{state.error}</p>}
        <div className={cx(styles.actionButtons, large && styles.actionButtonsLarge)}>
          <button className={cx(ui.btn, ui.secondary)} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className={cx(ui.btn, ui.primary)} onClick={onConfirm} disabled={busy}>
            {busy ? "Saving..." : "Confirm"}
          </button>
        </div>
      </>
    )}
    {state.status === "done" && (
      <div className={cx(styles.actionOutcome, styles.outcomeDone)}>
        <FontAwesomeIcon icon={faCircleCheck} />
        <span>{state.message}</span>
        {state.link && (
          <button className={styles.linkButton} onClick={() => onOpen(state.link!)}>
            Open {state.link.label}
          </button>
        )}
      </div>
    )}
    {state.status === "cancelled" && <div className={styles.actionOutcome}>Cancelled, nothing was changed.</div>}
    {state.status === "withdrawn" && (
      <div className={styles.actionOutcome}>Replaced by your next request, nothing was changed.</div>
    )}
    {state.status === "expired" && (
      <div className={styles.actionOutcome}>This proposal expired. Ask again if you still want it.</div>
    )}
  </div>
);

export default ActionCard;
