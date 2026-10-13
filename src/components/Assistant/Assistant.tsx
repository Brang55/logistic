import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faChevronDown,
  faMicrophone,
  faPaperPlane,
  faRotateLeft,
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";

import { useAssistantStatusQuery } from "../../app/api/assistant";
import { isPhone } from "../../hooks/useMediaQuery";
import { useSpeech } from "../../hooks/useSpeech";
import { groupMessages } from "../../utils/notices";
import { cx } from "../ui/helpers";
import { ConfirmDialog } from "../ui/ui";
import ui from "../ui/ui.module.css";

import ActionCard from "./ActionCard";
import Reply from "./Reply";
import { useAssistantChat } from "./useAssistantChat";
import styles from "./Assistant.module.css";

const EXAMPLES = [
  "Which trucks are running late?",
  "Assign an available truck to the newest Chicago load",
  "Create a load from Dallas to Atlanta, 40,000 lb, pickup Friday",
  "What documents or maintenance need attention?",
  "Show me the live fleet",
];

// Pages that are mostly a map: the panel gets out of the way when the assistant sends you there.
const MAP_PAGES = ["/fleet", "/dispatcher", "/track"];

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

type Chat = ReturnType<typeof useAssistantChat>;

/**
 * Staff assistant: type or speak a request; it answers, opens pages, and proposes changes
 * that only happen when the user presses Confirm on the card.
 */
const AssistantPanel = ({ open, chat, onMinimize }: { open: boolean; chat: Chat; onMinimize: () => void }) => {
  const { data: status } = useAssistantStatusQuery();
  const { restrictions } = chat;
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const submit = (message: string, spoken = false) => {
    setText("");
    void chat.submit(message, spoken);
  };
  const speech = useSpeech((heard) => submit(heard, true));

  const restart = () => {
    chat.restart();
    inputRef.current?.focus();
  };

  // Escape minimizes, unless the restrictions dialog on top of the panel is open.
  const minimizeOnEscape = useCallback(
    (event: KeyboardEvent) => event.key === "Escape" && !restrictions && onMinimize(),
    [onMinimize, restrictions]
  );
  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", minimizeOnEscape);
    return () => window.removeEventListener("keydown", minimizeOnEscape);
  }, [open, minimizeOnEscape]);

  const { stop } = speech;
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else stop();
  }, [open, stop]);
  useEffect(() => {
    if (open) bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [open, chat.entries, chat.sending]);

  const disabled = status?.enabled === false;

  return (
    <aside className={styles.panel} role="dialog" aria-label="Assistant" hidden={!open}>
      <div className={styles.header}>
        <span className={styles.headerMark}>
          <FontAwesomeIcon icon={faWandMagicSparkles} />
        </span>
        <span className={styles.headerText}>
          <strong>Assistant</strong>
          <span>Ask, or tell it what to do. Changes wait for your OK.</span>
        </span>
        {chat.entries.length > 0 && (
          <button className={styles.headerButton} onClick={restart} title="New conversation" aria-label="New conversation">
            <FontAwesomeIcon icon={faRotateLeft} />
          </button>
        )}
        <button className={styles.headerButton} onClick={onMinimize} title="Minimize (Esc)" aria-label="Minimize assistant">
          <FontAwesomeIcon icon={faChevronDown} />
        </button>
      </div>

      <div className={styles.body} ref={bodyRef} aria-live="polite">
        {disabled && (
          <div className={styles.notice}>
            The assistant isn't set up yet. Add an <strong>ANTHROPIC_API_KEY</strong> to the server's environment and
            restart it.
          </div>
        )}
        {!chat.entries.length && !disabled && (
          <>
            <p className={styles.intro}>
              It can look up loads, trucks and drivers, check who's late, open pages, and prepare new loads,
              edits and assignments for you to confirm. Try:
            </p>
            <div className={styles.examples}>
              {EXAMPLES.map((example) => (
                <button key={example} className={styles.example} onClick={() => submit(example)}>
                  {example}
                </button>
              ))}
            </div>
          </>
        )}

        {chat.entries.map((entry, i) => {
          switch (entry.kind) {
            case "user":
              return (
                <p key={i} className={styles.bubbleUser}>
                  {entry.text}
                </p>
              );
            case "reply":
              return entry.error ? (
                <p key={i} className={cx(styles.bubbleReply, styles.bubbleError)}>
                  {entry.text}
                </p>
              ) : (
                <div key={i} className={styles.bubbleReply}>
                  <Reply text={entry.text} onNavigate={chat.navigated} />
                </div>
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
                  busy={chat.confirming}
                  onConfirm={() => void chat.confirm(entry.action)}
                  onCancel={() => void chat.cancel(entry.action)}
                  onOpen={chat.open}
                />
              );
          }
        })}
        {chat.sending && (
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
          submit(text);
        }}
      >
        {speech.supported && (
          <button
            type="button"
            className={cx(styles.roundButton, speech.listening ? styles.listening : styles.micIdle)}
            onClick={speech.listening ? speech.stop : speech.listen}
            disabled={disabled || chat.sending}
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
        <button className={styles.roundButton} type="submit" disabled={disabled || !text.trim() || chat.sending} aria-label="Send">
          <FontAwesomeIcon icon={faPaperPlane} />
        </button>
      </form>
      {speech.error && <p className={styles.hint}>{speech.error}</p>}

      {restrictions && (
        <ConfirmDialog
          danger
          title="Truck restrictions on this route"
          confirmLabel="Assign anyway"
          busy={chat.confirming}
          onConfirm={() => void chat.confirm(restrictions.action, true)}
          onCancel={chat.dismissRestrictions}
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
    </aside>
  );
};

/**
 * The assistant on every staff page: a round button in the bottom-right corner (or ⌘K / Ctrl+K)
 * opens a chat panel above it, and minimizing folds it back into the button. The conversation
 * stays; while minimized the button shows when the assistant is thinking, has news, or has
 * changes waiting to be confirmed.
 */
// `hidden` hides only the round button (the chat is kept), e.g. while the phone menu is open.
export const AssistantLauncher = ({ hidden = false }: { hidden?: boolean }) => {
  const [open, setOpen] = useState(false);
  const minimize = useCallback(() => setOpen(false), []);

  // After the assistant opens a page, get out of the way where the panel would hide it:
  // on map pages, and on phones, where the panel covers the whole screen.
  const chat = useAssistantChat({
    onNavigate: (path) => {
      if (isPhone() || MAP_PAGES.some((page) => path.startsWith(page))) minimize();
    },
  });

  // Replies the user hasn't seen because the panel was minimized.
  const replies = chat.entries.filter((e) => e.kind === "reply").length;
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (open) setSeen(replies);
  }, [open, replies]);
  const unread = !open && replies > seen;
  const toConfirm = chat.entries.filter((e) => e.kind === "action" && e.state.status === "pending").length;

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

  const label = open
    ? "Minimize assistant"
    : chat.sending
      ? "Assistant is thinking"
      : toConfirm
        ? `Assistant: ${toConfirm} change${toConfirm === 1 ? "" : "s"} to confirm`
        : unread
          ? "Assistant: new reply"
          : `Ask the assistant (${isMac ? "⌘K" : "Ctrl+K"})`;

  // In <body>, so it floats over every page and isn't tied to the sidebar.
  return createPortal(
    <>
      <AssistantPanel open={open} chat={chat} onMinimize={minimize} />
      <button
        data-assistant-launcher
        hidden={hidden}
        className={cx(styles.fab, open && styles.fabOpen, chat.sending && !open && styles.fabBusy)}
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-expanded={open}
        title={label}
      >
        <FontAwesomeIcon icon={open ? faChevronDown : faWandMagicSparkles} />
        {!open && toConfirm > 0 && <span className={styles.fabCount}>{toConfirm}</span>}
        {!open && !toConfirm && unread && <span className={styles.fabDot} />}
      </button>
    </>,
    document.body
  );
};
