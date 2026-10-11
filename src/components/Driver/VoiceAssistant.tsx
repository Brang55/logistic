import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMicrophone, faPaperPlane, faWaveSquare } from "@fortawesome/free-solid-svg-icons";
import {
  useExecuteVoiceMutation,
  useInterpretVoiceMutation,
  type VoiceExecution,
  type VoiceProposal,
} from "../../app/api/trips";

import { cx } from "../ui/helpers";
import ui from "../ui/ui.module.css";

import shared from "./driver.module.css";
import styles from "./VoiceAssistant.module.css";
import { errorMessage } from "../../utils/errors";
import { speak, useSpeech } from "../../hooks/useSpeech";

const EXAMPLES = ["I'll be 30 minutes late, heavy traffic", "What's my next stop?", "Set the delivery address to "];

/**
 * Hands-free commands: speak (or type) a command, hear what was understood, confirm.
 * Nothing changes until the driver confirms the proposed action.
 */
const VoiceAssistant = () => {
  const [transcript, setTranscript] = useState("");
  const [typed, setTyped] = useState("");
  const [proposal, setProposal] = useState<VoiceProposal>();
  const [minutes, setMinutes] = useState<number>(30);
  const [location, setLocation] = useState("");
  const [reply, setReply] = useState("");
  const [interpret, interpreting] = useInterpretVoiceMutation();
  const [execute, executing] = useExecuteVoiceMutation();

  const handle = async (text: string) => {
    if (!text.trim()) return;
    setTranscript(text);
    setProposal(undefined);
    setReply("");
    const result = await interpret(text);
    if ("error" in result) return setReply(errorMessage(result.error));
    const next = result.data;
    setReply(next.reply);
    speak(next.reply);
    if (next.needsConfirmation) {
      setProposal(next);
      setMinutes(next.intent.delayMinutes ?? 30);
      setLocation(next.intent.location ?? "");
    }
  };

  const confirm = async () => {
    if (!proposal?.cargoId) return;
    const { action } = proposal.intent;
    const body: VoiceExecution = { action: action as VoiceExecution["action"], cargoId: proposal.cargoId };
    if (action === "report_delay") Object.assign(body, { delayMinutes: minutes, reason: proposal.intent.reason ?? undefined });
    if (action === "set_pickup_location" || action === "set_delivery_location") body.location = location;
    const result = await execute(body);
    const message = "error" in result ? errorMessage(result.error) : result.data.reply;
    setReply(message);
    speak(message);
    setProposal(undefined);
  };

  const speech = useSpeech((text) => void handle(text));
  const listening = speech.listening;
  // Microphone problems show where replies do.
  useEffect(() => {
    if (speech.error) setReply(speech.error);
  }, [speech.error]);

  const action = proposal?.intent.action;

  const busy = listening || interpreting.isLoading;

  return (
    <section className={shared.card}>
      <div className={shared.cardHeader}>
        <h2>
          <FontAwesomeIcon icon={faWaveSquare} /> Voice assistant
        </h2>
      </div>
      <div className={styles.voice}>
        {speech.supported && (
          <button
            className={cx(styles.micButton, listening && styles.listening)}
            onClick={speech.listen}
            disabled={busy}
            aria-label="Speak a command"
          >
            <FontAwesomeIcon icon={faMicrophone} />
          </button>
        )}
        <div className={styles.voiceText}>
          <strong>{listening ? "Listening..." : interpreting.isLoading ? "Thinking..." : "Hands-free commands"}</strong>
          <span className={shared.muted}>
            {speech.supported
              ? "Tap the microphone and speak. Nothing changes until you confirm."
              : "Voice input isn't supported in this browser. Type your command instead."}
          </span>
        </div>
      </div>

      <form
        className={styles.commandRow}
        onSubmit={(event) => {
          event.preventDefault();
          void handle(typed);
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
        <button className={shared.sendButton} type="submit" disabled={!typed.trim() || interpreting.isLoading} aria-label="Send command">
          <FontAwesomeIcon icon={faPaperPlane} />
        </button>
      </form>
      {!transcript && (
        <div className={shared.examples}>
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className={shared.chip} onClick={() => setTyped(example)}>
              “{example.trim()}{example.endsWith(" ") ? " …" : ""}”
            </button>
          ))}
        </div>
      )}

      {transcript && (
        <div className={styles.conversation}>
          <p className={styles.bubbleUser}>{transcript}</p>
          {reply && <p className={styles.bubbleReply}>{reply}</p>}
        </div>
      )}
      {!transcript && reply && <p className={styles.bubbleReply}>{reply}</p>}

      {proposal && (
        <div className={styles.proposal}>
          {action === "report_delay" && (
            <label className={ui.field}>
              <span className={ui.label}>Delay (minutes)</span>
              <input className={ui.input} type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
            </label>
          )}
          {(action === "set_pickup_location" || action === "set_delivery_location") && (
            <label className={ui.field}>
              <span className={ui.label}>New address</span>
              <input className={ui.input} value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>
          )}
          <div className={shared.dialogButtons}>
            <button className={cx(ui.btn, ui.secondary)} onClick={() => setProposal(undefined)}>
              Cancel
            </button>
            <button className={cx(ui.btn, ui.primary)} onClick={confirm} disabled={executing.isLoading}>
              {executing.isLoading ? "Saving..." : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default VoiceAssistant;
