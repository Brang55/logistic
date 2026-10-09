import { Injectable } from "@nestjs/common";
import { IntentParser, VoiceIntent } from "./voice.types";

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, "twenty five": 25, thirty: 30, forty: 40, "forty five": 45, fifty: 50, sixty: 60, ninety: 90,
};

const intent = (action: VoiceIntent["action"], fields: Partial<VoiceIntent> = {}): VoiceIntent => ({
  action,
  delayMinutes: null,
  reason: null,
  location: null,
  clarification: null,
  ...fields,
});

/** Minutes mentioned in a sentence: "45 minutes", "an hour and a half", "2 hours", "half an hour". */
export function parseMinutes(text: string): number | null {
  const t = text.toLowerCase().replace(/-/g, " ");
  if (/\b(an|one) hour and a half\b|\bone and a half hours?\b|\b1\.5 hours?\b/.test(t)) return 90;
  if (/\bhalf an hour\b|\bhalf hour\b/.test(t)) return 30;
  if (/\b(an|a|one) hour\b/.test(t)) return 60;

  const numeric = t.match(/\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/);
  if (numeric) {
    const value = Number(numeric[1]);
    return Math.round(numeric[2].startsWith("h") ? value * 60 : value);
  }
  const words = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join("|");
  const worded = t.match(new RegExp(`\\b(${words})\\s+(hours?|minutes?|mins?)\\b`));
  if (worded) {
    const value = NUMBER_WORDS[worded[1]];
    return worded[2].startsWith("h") ? value * 60 : value;
  }
  return null;
}

// Strips filler like "to", "is", "please" around a spoken place name.
const cleanPlace = (text: string) =>
  text
    .replace(/^[\s:,-]*(to|is|at|as)\s+/i, "")
    .replace(/[\s.,!]*(please|thanks|thank you)?[\s.!]*$/i, "")
    .trim();

/**
 * Keyword parser for English driver commands. Used when no Anthropic API key is configured,
 * and as the fallback when the Claude parser fails.
 */
@Injectable()
export class RuleBasedIntentParser extends IntentParser {
  readonly name = "rules";

  // The keyword rules don't need the trip context.
  async parse(transcript: string): Promise<VoiceIntent> {
    const text = transcript.trim();
    const t = text.toLowerCase();

    const setLocation = t.match(
      /\b(?:set|change|update|new)\b.*?\b(pick ?up|delivery|drop ?off|unloading|loading)\b(?:\s+(?:destination|address|location|point|place))?\s*(?:to|is|:|at)?\s+(.+)$/i,
    );
    if (setLocation) {
      const kind = /pick ?up|loading/.test(setLocation[1]) && !/unloading/.test(setLocation[1]) ? "pickup" : "delivery";
      const location = cleanPlace(text.slice(text.length - setLocation[2].length));
      if (location) return intent(kind === "pickup" ? "set_pickup_location" : "set_delivery_location", { location });
    }

    if (/\b(delay(ed)?|late|behind( schedule)?|stuck|running behind|won'?t make it|traffic jam)\b/.test(t)) {
      const reason = text.match(/\b(?:because(?: of)?|due to|there(?:'s| is) an?)\s+(.+?)[.!]?$/i)?.[1] ?? null;
      return intent("report_delay", { delayMinutes: parseMinutes(t), reason });
    }

    if (/\b(delivered|unloaded|dropped (it )?off|delivery (is )?(done|complete|finished))\b/.test(t)) {
      return intent("confirm_delivery");
    }
    if (/\b(picked (it )?up|loaded|got the (load|cargo|goods)|pick ?up (is )?(done|complete|finished))\b/.test(t)) {
      return intent("confirm_pickup");
    }
    if (/\b(next stop|where (am i|do i) go|where to|eta|how (long|far)|when will i (arrive|get there))\b/.test(t)) {
      return intent("next_stop");
    }

    return intent("unknown", {
      clarification: "Sorry, I didn't get that. You can report a delay, confirm pickup or delivery, or change an address.",
    });
  }
}
