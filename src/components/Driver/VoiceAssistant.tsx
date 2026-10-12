import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMicrophone, faPaperPlane, faRotateLeft, faWaveSquare } from "@fortawesome/free-solid-svg-icons";

import { useAssistantStatusQuery } from "../../app/api/assistant";
import { useSpeech } from "../../hooks/useSpeech";
import ActionCard from "../Assistant/ActionCard";
import Reply from "../Assistant/Reply";
import { useAssistantChat } from "../Assistant/useAssistantChat";
import { cx } from "../ui/helpers";
import ui from "../ui/ui.module.css";

import shared from "./driver.module.css";
import styles from "./VoiceAssistant.module.css";

const EXAMPLES = [
  "I'll be 30 minutes late, heavy traffic",
  "What's my next stop?",
  "Police ahead",
  "Tell dispatch the dock is closed until 3",
];
// Keeps the card short on the trip page; the newest exchange is what matters while driving.
const VISIBLE_ENTRIES = 6;

/**
 * Hands-free assistant on the driver's trip page: speak (or type), hear the answer, and
 * confirm any change on its card. Nothing changes until the driver taps Confirm.
 */
const VoiceAssistant = () => {
  const { data: status } = useAssistantStatusQuery();
  const chat = useAssistantChat();
  const [typed, setTyped] = useState("");
  const speech = useSpeech((heard) => void chat.submit(heard, true));
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chat.entries]);

  const visible = chat.entries.slice(-VISIBLE_ENTRIES);
  const busy = speech.listening || chat.sending;
  const keywordsOnly = status?.model === "keywords";

  return (
    <section className={shared.card}>
      <div className={shared.cardHeader}>
        <h2>
          <FontAwesomeIcon icon={faWaveSquare} /> Voice assistant
        </h2>
        {chat.entries.length > 0 && (
          <button className={styles.restart} onClick={chat.restart} aria-label="Start over" title="Start over">
            <FontAwesomeIcon icon={faRotateLeft} />
          </button>
        )}
      </div>
      <div className={styles.voice}>
        {speech.supported && (
          <button
            className={cx(styles.micButton, speech.listening && styles.listening)}
            onClick={speech.listening ? speech.stop : speech.listen}
            disabled={chat.sending}
            aria-label={speech.listening ? "Stop listening" : "Speak a command"}
          >
            <FontAwesomeIcon icon={faMicrophone} />
          </button>
        )}
        <div className={styles.voiceText}>
          <strong>{speech.listening ? "Listening..." : chat.sending ? "Thinking..." : "Hands-free commands"}</strong>
          <span className={shared.muted}>
            {speech.error ||
              (speech.supported
                ? "Tap the microphone and speak. Nothing changes until you confirm."
                : "Voice input isn't supported in this browser. Type your command instead.")}
          </span>
          {keywordsOnly && <span className={shared.muted}>Basic English commands only right now.</span>}
        </div>
      </div>

      <form
        className={styles.commandRow}
        onSubmit={(event) => {
          event.preventDefault();
          void chat.submit(typed);
          setTyped("");
        }}
      >
        <input
          className={ui.input}
          placeholder="Type a command"
          aria-label="Type a command"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button className={shared.sendButton} type="submit" disabled={!typed.trim() || busy} aria-label="Send command">
          <FontAwesomeIcon icon={faPaperPlane} />
        </button>
      </form>

      {!chat.entries.length && (
        <div className={shared.examples}>
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className={shared.chip} onClick={() => void chat.submit(example)}>
              “{example}”
            </button>
          ))}
        </div>
      )}

      {visible.length > 0 && (
        <div className={styles.conversation} ref={listRef} aria-live="polite">
          {visible.map((entry, i) => {
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
                    <Reply text={entry.text} />
                  </div>
                );
              case "event":
                return null;
              case "action":
                return (
                  <ActionCard
                    key={entry.action.id}
                    large
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
        </div>
      )}
    </section>
  );
};

export default VoiceAssistant;
