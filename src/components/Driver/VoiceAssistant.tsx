import { useEffect, useRef, useState } from "react";
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

import styles from "./DriverTrip.module.css";
import { errorMessage } from "../../utils/errors";

// Minimal typing for the Web Speech API (not in TypeScript's DOM library).
interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionConstructor = new () => Recognition;

const SpeechRecognitionImpl: RecognitionConstructor | undefined =
  (window as unknown as { SpeechRecognition?: RecognitionConstructor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionConstructor }).webkitSpeechRecognition;

const speak = (text: string) => {
  if (!("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = navigator.language;
  window.speechSynthesis.speak(utterance);
};

const EXAMPLES = ["I'll be 30 minutes late, heavy traffic", "What's my next stop?", "Set the delivery address to "];

/**
 * Hands-free commands: speak (or type) a command, hear what was understood, confirm.
 * Nothing changes until the driver confirms the proposed action.
 */
const VoiceAssistant = () => {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [typed, setTyped] = useState("");
  const [proposal, setProposal] = useState<VoiceProposal>();
  const [minutes, setMinutes] = useState<number>(30);
  const [location, setLocation] = useState("");
  const [reply, setReply] = useState("");
  const recognition = useRef<Recognition>();
  const [interpret, interpreting] = useInterpretVoiceMutation();
  const [execute, executing] = useExecuteVoiceMutation();

  useEffect(() => () => recognition.current?.stop(), []);

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

  const listen = () => {
    if (!SpeechRecognitionImpl) return;
    const r = new SpeechRecognitionImpl();
    r.lang = navigator.language;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (event) => void handle(event.results[0][0].transcript);
    r.onerror = (event) => setReply(event.error === "not-allowed" ? "Microphone access was blocked." : "I couldn't hear that. Try again.");
    r.onend = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
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

  const action = proposal?.intent.action;

  const busy = listening || interpreting.isLoading;

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2>
          <FontAwesomeIcon icon={faWaveSquare} /> Voice assistant
        </h2>
      </div>
      <div className={styles.voice}>
        {SpeechRecognitionImpl && (
          <button
            className={cx(styles.micButton, listening && styles.listening)}
            onClick={listen}
            disabled={busy}
            aria-label="Speak a command"
          >
            <FontAwesomeIcon icon={faMicrophone} />
          </button>
        )}
        <div className={styles.voiceText}>
          <strong>{listening ? "Listening..." : interpreting.isLoading ? "Thinking..." : "Hands-free commands"}</strong>
          <span className={styles.muted}>
            {SpeechRecognitionImpl
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
        <button className={styles.sendButton} type="submit" disabled={!typed.trim() || interpreting.isLoading} aria-label="Send command">
          <FontAwesomeIcon icon={faPaperPlane} />
        </button>
      </form>
      {!transcript && (
        <div className={styles.examples}>
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className={styles.chip} onClick={() => setTyped(example)}>
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
          <div className={styles.dialogButtons}>
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
