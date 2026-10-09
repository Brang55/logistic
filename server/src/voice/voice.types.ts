export const VOICE_ACTIONS = [
  "report_delay",
  "confirm_pickup",
  "confirm_delivery",
  "set_pickup_location",
  "set_delivery_location",
  "next_stop",
  "unknown",
] as const;

export type VoiceAction = (typeof VOICE_ACTIONS)[number];

/** What the driver asked for, as understood from the transcript. */
export interface VoiceIntent {
  action: VoiceAction;
  delayMinutes: number | null;
  reason: string | null;
  /** Place as spoken, for the set_*_location actions. */
  location: string | null;
  /** For "unknown": a short question back to the driver. */
  clarification: string | null;
}

/** The driver's current load, so commands like "the delivery" can be resolved. */
export interface VoiceContext {
  pickup: string;
  delivery: string;
  pickedUp: boolean;
}

export abstract class IntentParser {
  abstract readonly name: string;
  abstract parse(transcript: string, context: VoiceContext | null): Promise<VoiceIntent>;
}
