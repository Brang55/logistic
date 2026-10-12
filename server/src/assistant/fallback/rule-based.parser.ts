import { ReportType } from "../../community/report-types";

/** One driver command, as the keyword rules understand it. */
export interface DriverIntent {
  action:
    | "report_delay"
    | "confirm_pickup"
    | "confirm_delivery"
    | "set_pickup_location"
    | "set_delivery_location"
    | "road_report"
    | "next_stop"
    | "unknown";
  delayMinutes: number | null;
  reason: string | null;
  /** Place as spoken, for the set_*_location actions. */
  location: string | null;
  reportType: ReportType | null;
  /** For "unknown": a short question back to the driver. */
  clarification: string | null;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, "twenty five": 25, thirty: 30, forty: 40, "forty five": 45, fifty: 50, sixty: 60, ninety: 90,
};

const intent = (action: DriverIntent["action"], fields: Partial<DriverIntent> = {}): DriverIntent => ({
  action,
  delayMinutes: null,
  reason: null,
  location: null,
  reportType: null,
  clarification: null,
  ...fields,
});

// Spoken road hazards, checked after delays so "late because of an accident" stays a delay.
const ROAD_REPORTS: [RegExp, ReportType][] = [
  [/\b(police|cops?|speed trap|state trooper)\b/, "police"],
  [/\b(accident|crash|collision|wreck)\b/, "accident"],
  [/\broad (is )?closed\b|\bclosure\b/, "closure"],
  [/\b(road ?works?|construction|work zone)\b/, "roadworks"],
  [/\b(debris|hazard|pothole|something on the road)\b/, "hazard"],
  [/\b(black ice|icy|fog|snow|flood(ing|ed)?|storm)\b/, "weather"],
  [/\b(heavy traffic|congestion|backed up)\b/, "traffic"],
];

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
 * Keyword parser for English driver commands: the driver assistant's fallback when no
 * Anthropic API key is configured or Claude can't be reached, so voice commands keep working.
 */
export class RuleBasedIntentParser {
  parse(transcript: string): DriverIntent {
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
    const road = ROAD_REPORTS.find(([pattern]) => pattern.test(t));
    if (road) return intent("road_report", { reportType: road[1] });

    if (/\b(next stop|where (am i|do i) go|where to|eta|how (long|far)|when will i (arrive|get there))\b/.test(t)) {
      return intent("next_stop");
    }

    return intent("unknown", {
      clarification: "Sorry, I didn't get that. You can report a delay or a road problem, confirm pickup or delivery, or change an address.",
    });
  }
}
