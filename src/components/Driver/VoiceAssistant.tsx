import { useEffect, useRef, useState } from "react";
import {
  useExecuteVoiceMutation,
  useInterpretVoiceMutation,
  type VoiceExecution,
  type VoiceProposal,
} from "../../app/features/driver/tripsSlice";

import styles from "./DriverTrip.module.css";

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

const errorMessage = (error: unknown) =>
  (error as { data?: { message?: string } } | undefined)?.data?.message ?? "Something went wrong. Try again.";

const EXAMPLES = ["I'll be 30 minutes late, heavy traffic", "Set the delivery address to …", "Picked up the load", "What's my next stop?"];

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

  return (
    <section className={styles.card}>
      <h3>Voice commands</h3>
      {SpeechRecognitionImpl ? (
        <button className={`${styles.mic} ${listening ? styles.listening : ""}`} onClick={listen} disabled={listening || interpreting.isLoading}>
          {listening ? "Listening..." : interpreting.isLoading ? "Thinking..." : "🎤 Tap and speak"}
        </button>
      ) : (
        <p className={styles.muted}>Voice input isn't supported in this browser; type your command instead.</p>
      )}
      <form
        className={styles.delayRow}
        onSubmit={(event) => {
          event.preventDefault();
          void handle(typed);
          setTyped("");
        }}
      >
        <input placeholder="…or type a command" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button className={styles.send} type="submit" disabled={!typed.trim() || interpreting.isLoading}>
          Send
        </button>
      </form>
      {!transcript && <p className={styles.muted}>Try: {EXAMPLES.map((e) => `“${e}”`).join(" · ")}</p>}
      {transcript && <p className={styles.muted}>You said: “{transcript}”</p>}
      {reply && <p className={styles.reply}>{reply}</p>}

      {proposal && (
        <div className={styles.proposal}>
          {action === "report_delay" && (
            <label>
              Delay (minutes){" "}
              <input type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
            </label>
          )}
          {(action === "set_pickup_location" || action === "set_delivery_location") && (
            <label>
              New address <input value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>
          )}
          <div className={styles.proposalButtons}>
            <button className={styles.primary} onClick={confirm} disabled={executing.isLoading}>
              {executing.isLoading ? "Saving..." : "Confirm"}
            </button>
            <button className={styles.secondary} onClick={() => setProposal(undefined)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default VoiceAssistant;
