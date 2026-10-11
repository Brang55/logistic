import { useCallback, useEffect, useRef, useState } from "react";

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

/** Reads a reply aloud, interrupting anything still being read. */
export const speak = (text: string) => {
  if (!("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = navigator.language;
  window.speechSynthesis.speak(utterance);
};

/**
 * Speech input through the browser (Chrome, Edge, Safari; not Firefox).
 * `listen` hands one recognised sentence to `onText`; `error` explains why nothing was heard.
 */
export const useSpeech = (onText: (text: string) => void) => {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recognition = useRef<Recognition>();
  // The latest callback, so a recognition started earlier doesn't call a stale one.
  const handler = useRef(onText);
  handler.current = onText;

  useEffect(() => () => recognition.current?.stop(), []);

  const listen = useCallback(() => {
    if (!SpeechRecognitionImpl) return;
    const r = new SpeechRecognitionImpl();
    r.lang = navigator.language;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (event) => handler.current(event.results[0][0].transcript);
    r.onerror = (event) =>
      setError(event.error === "not-allowed" ? "Microphone access was blocked." : "I couldn't hear that. Try again.");
    r.onend = () => setListening(false);
    recognition.current = r;
    setError("");
    setListening(true);
    r.start();
  }, []);

  const stop = useCallback(() => recognition.current?.stop(), []);

  return { supported: !!SpeechRecognitionImpl, listening, error, listen, stop };
};
