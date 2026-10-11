import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faCircleCheck,
  faMicrophone,
  faPaperPlane,
  faRotateLeft,
  faTriangleExclamation,
  faWandMagicSparkles,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import {
  useAssistantStatusQuery,
  useCancelAssistantActionMutation,
  useConfirmAssistantActionMutation,
  useSendAssistantMessageMutation,
  type ProposedAction,
  type UiAction,
} from "../../app/api/assistant";
import { speak, useSpeech } from "../../hooks/useSpeech";
import { errorMessage } from "../../utils/errors";
import { groupMessages } from "../../utils/notices";
import { cx } from "../ui/helpers";
import { ConfirmDialog } from "../ui/ui";
import ui from "../ui/ui.module.css";

import styles from "./Assistant.module.css";

const EXAMPLES = [
  "Which trucks are running late?",
  "Assign an available truck to the newest Chicago load",
  "Create a load from Dallas to Atlanta, 40,000 lb, pickup Friday",
  "What documents or maintenance need attention?",
  "Show me the live fleet",
];

type ActionState =
  | { status: "pending"; error?: string }
  | { status: "done"; message: string; link?: UiAction }
  | { status: "cancelled" | "expired" | "withdrawn" };

type Entry =
  | { kind: "user"; text: string }
  | { kind: "reply"; text: string; error?: boolean }
  | { kind: "event"; text: string }
  | { kind: "action"; action: ProposedAction; state: ActionState };

// The API refuses a truck whose route breaks height or weight limits until the user accepts them.
const restrictionsIn = (error: unknown) => {
  const { status, data } = (error ?? {}) as { status?: number; data?: { code?: string; violations?: string[] } };
  return status === 409 && data?.code === "ROUTE_RESTRICTIONS" ? (data.violations ?? []) : undefined;
};

const isGone = (error: unknown) => (error as { status?: number } | undefined)?.status === 404;

/**
 * Staff assistant: type or speak a request; it answers, opens pages, and proposes changes
 * that only happen when the user presses Confirm on the card.
 */
const AssistantDrawer = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: status } = useAssistantStatusQuery();
  const [send, sending] = useSendAssistantMessageMutation();
  const [confirmAction, confirming] = useConfirmAssistantActionMutation();
  const [cancelAction] = useCancelAssistantActionMutation();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [text, setText] = useState("");
  const [restrictions, setRestrictions] = useState<{ action: ProposedAction; violations: string[]; error?: string }>();
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const add = (...more: Entry[]) => setEntries((list) => [...list, ...more]);
  const updateAction = (id: string, state: ActionState) =>
    setEntries((list) => list.map((e) => (e.kind === "action" && e.action.id === id ? { ...e, state } : e)));

  const go = (action: UiAction) => {
    navigate(action.path);
    add({ kind: "event", text: `Opened ${action.label}` });
  };

  const submit = async (message: string, spoken = false) => {
    const trimmed = message.trim();
    if (!trimmed || sending.isLoading) return;
    setText("");
    // The server withdraws proposals left unconfirmed when a new request comes in.
    setEntries((list) => [
      ...list.map((e): Entry => (e.kind === "action" && e.state.status === "pending" ? { ...e, state: { status: "withdrawn" } } : e)),
      { kind: "user", text: trimmed },
    ]);
    const result = await send({ text: trimmed, conversationId, page: location.pathname + location.search });
    if ("error" in result) {
      add({ kind: "reply", text: errorMessage(result.error), error: true });
      return;
    }
    const { reply, actions, ui: uiActions } = result.data;
    setConversationId(result.data.conversationId);
    add(
      { kind: "reply", text: reply },
      ...actions.map((action): Entry => ({ kind: "action", action, state: { status: "pending" } }))
    );
    uiActions.forEach(go);
    if (spoken) speak(reply);
  };

  const speech = useSpeech((heard) => void submit(heard, true));

  const confirm = async (action: ProposedAction, acceptRestrictions = false) => {
    const result = await confirmAction({ id: action.id, acceptRestrictions });
    if ("data" in result) {
      setRestrictions(undefined);
      updateAction(action.id, { status: "done", ...result.data });
      return;
    }
    const violations = restrictionsIn(result.error);
    if (violations) {
      setRestrictions({ action, violations });
    } else if (isGone(result.error)) {
      setRestrictions(undefined);
      updateAction(action.id, { status: "expired" });
    } else if (restrictions) {
      setRestrictions({ ...restrictions, error: errorMessage(result.error, "Could not assign the truck.") });
    } else {
      updateAction(action.id, { status: "pending", error: errorMessage(result.error) });
    }
  };

  const cancel = async (action: ProposedAction) => {
    updateAction(action.id, { status: "cancelled" });
    // Already expired on the server is just as good as cancelled.
    await cancelAction(action.id);
  };

  const restart = () => {
    setEntries([]);
    setConversationId(undefined);
    inputRef.current?.focus();
  };

  // Escape closes the drawer, unless the restrictions dialog on top of it is open.
  const closeOnEscape = useCallback(
    (event: KeyboardEvent) => event.key === "Escape" && !restrictions && onClose(),
    [onClose, restrictions]
  );
  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, closeOnEscape]);

  const { stop } = speech;
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else stop();
  }, [open, stop]);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [entries, sending.isLoading]);

  const disabled = status?.enabled === false;

  // In <body>, so it stays visible when the mobile menu that holds the launcher collapses.
  return createPortal(
    <aside className={styles.drawer} role="dialog" aria-label="Assistant" hidden={!open}>
      <div className={styles.header}>
        <span className={styles.headerMark}>
          <FontAwesomeIcon icon={faWandMagicSparkles} />
        </span>
        <span className={styles.headerText}>
          <strong>Assistant</strong>
          <span>Ask, or tell it what to do. Changes wait for your OK.</span>
        </span>
        {entries.length > 0 && (
          <button className={styles.headerButton} onClick={restart} title="New conversation" aria-label="New conversation">
            <FontAwesomeIcon icon={faRotateLeft} />
          </button>
        )}
        <button className={styles.headerButton} onClick={onClose} aria-label="Close assistant">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className={styles.body} ref={bodyRef} aria-live="polite">
        {disabled && (
          <div className={styles.notice}>
            The assistant isn't set up yet. Add an <strong>ANTHROPIC_API_KEY</strong> to the server's environment and
            restart it.
          </div>
        )}
        {!entries.length && !disabled && (
          <>
            <p className={styles.intro}>
              It can look up loads, trucks and drivers, check who's late, open pages, and prepare new loads,
              edits and assignments for you to confirm. Try:
            </p>
            <div className={styles.examples}>
              {EXAMPLES.map((example) => (
                <button key={example} className={styles.example} onClick={() => void submit(example)}>
                  {example}
                </button>
              ))}
            </div>
          </>
        )}

        {entries.map((entry, i) => {
          switch (entry.kind) {
            case "user":
              return (
                <p key={i} className={styles.bubbleUser}>
                  {entry.text}
                </p>
              );
            case "reply":
              return (
                <p key={i} className={cx(styles.bubbleReply, entry.error && styles.bubbleError)}>
                  {entry.text}
                </p>
              );
            case "event":
              return (
                <span key={i} className={styles.event}>
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} /> {entry.text}
                </span>
              );
            case "action":
              return (
                <ActionCard
                  key={entry.action.id}
                  action={entry.action}
                  state={entry.state}
                  busy={confirming.isLoading}
                  onConfirm={() => void confirm(entry.action)}
                  onCancel={() => void cancel(entry.action)}
                  onOpen={go}
                />
              );
          }
        })}
        {sending.isLoading && (
          <span className={styles.thinking} aria-label="Thinking">
            <span />
            <span />
            <span />
          </span>
        )}
      </div>

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          void submit(text);
        }}
      >
        {speech.supported && (
          <button
            type="button"
            className={cx(styles.roundButton, speech.listening ? styles.listening : styles.micIdle)}
            onClick={speech.listening ? speech.stop : speech.listen}
            disabled={disabled || sending.isLoading}
            aria-label={speech.listening ? "Stop listening" : "Speak a request"}
            title={speech.listening ? "Stop listening" : "Speak a request"}
          >
            <FontAwesomeIcon icon={faMicrophone} />
          </button>
        )}
        <input
          ref={inputRef}
          className={ui.input}
          placeholder={speech.listening ? "Listening..." : "Ask or tell the assistant..."}
          aria-label="Message the assistant"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
        />
        <button className={styles.roundButton} type="submit" disabled={disabled || !text.trim() || sending.isLoading} aria-label="Send">
          <FontAwesomeIcon icon={faPaperPlane} />
        </button>
      </form>
      {speech.error && <p className={styles.hint}>{speech.error}</p>}

      {restrictions && (
        <ConfirmDialog
          danger
          title="Truck restrictions on this route"
          confirmLabel="Assign anyway"
          busy={confirming.isLoading}
          onConfirm={() => void confirm(restrictions.action, true)}
          onCancel={() => setRestrictions(undefined)}
          message={
            <>
              <p style={{ margin: "0 0 8px" }}>This truck's route breaks these limits:</p>
              <ul style={{ margin: "0 0 8px", paddingLeft: 18, color: "var(--color-danger)" }}>
                {groupMessages(restrictions.violations).map(({ message, count }) => (
                  <li key={message}>
                    {message}
                    {count > 1 && ` (${count} places)`}
                  </li>
                ))}
              </ul>
              <p style={{ margin: 0 }}>
                Assign it anyway only if the driver has a permit or another way in has been arranged. Your name is
                recorded on the load and the driver sees these restrictions.
              </p>
              {restrictions.error && <p style={{ margin: "8px 0 0", color: "var(--color-danger)" }}>{restrictions.error}</p>}
            </>
          }
        />
      )}
    </aside>,
    document.body
  );
};

const ActionCard = ({
  action,
  state,
  busy,
  onConfirm,
  onCancel,
  onOpen,
}: {
  action: ProposedAction;
  state: ActionState;
  busy: boolean;
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
        <div className={styles.actionButtons}>
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
            {state.link.label}
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

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

/** Sidebar button plus ⌘K / Ctrl+K, opening the assistant drawer on any staff page. */
export const AssistantLauncher = ({ onOpen }: { onOpen?: () => void }) => {
  const [open, setOpen] = useState(false);
  // Mounted on first use and then only hidden, so closing keeps the conversation.
  const [used, setUsed] = useState(false);
  useEffect(() => {
    if (open) setUsed(true);
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        className={styles.launcher}
        onClick={() => {
          setOpen(true);
          onOpen?.();
        }}
      >
        <FontAwesomeIcon icon={faWandMagicSparkles} fixedWidth />
        <span className={styles.launcherText}>Ask the assistant</span>
        <kbd className={styles.kbd}>{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      {used && <AssistantDrawer open={open} onClose={() => setOpen(false)} />}
    </>
  );
};
