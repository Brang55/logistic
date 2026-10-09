import Anthropic from "@anthropic-ai/sdk";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RuleBasedIntentParser } from "./rule-based.parser";
import { IntentParser, VOICE_ACTIONS, VoiceContext, VoiceIntent } from "./voice.types";

const DEFAULT_MODEL = "claude-opus-5-5";

// Frozen so the prompt prefix stays cacheable; per-request data goes in the user message.
const SYSTEM_PROMPT = `You turn a truck driver's spoken command into one action for a logistics app.
The transcript comes from speech recognition, so expect missing punctuation and misheard words.
It may be in any language; extract the same fields, and write any clarification in the driver's language.

Actions:
- report_delay: the driver will be late (to the pickup or the delivery). Put the delay in delay_minutes
  ("half an hour" = 30, "an hour and a half" = 90); null if no amount was said. Put the cause in reason, or null.
- confirm_pickup: the load has been collected.
- confirm_delivery: the load has been delivered.
- set_pickup_location / set_delivery_location: the driver gives a new pickup or delivery address
  ("set the next pickup destination to ..." is set_pickup_location). Put the place exactly as said in location.
- next_stop: the driver asks where to go next, how far it is, or when they will arrive.
- unknown: anything else; put a one-sentence question back to the driver in clarification.

Use null for fields that don't apply to the chosen action.`;

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: [...VOICE_ACTIONS] },
    delay_minutes: { type: ["integer", "null"] },
    reason: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    clarification: { type: ["string", "null"] },
  },
  required: ["action", "delay_minutes", "reason", "location", "clarification"],
  additionalProperties: false,
};

interface RawIntent {
  action: string;
  delay_minutes: number | null;
  reason: string | null;
  location: string | null;
  clarification: string | null;
}

/**
 * Claude-based parser (multilingual, tolerant of transcription errors). Falls back to the
 * keyword parser when the API errors, refuses, or returns something unusable, so a voice
 * command never fails just because the model is unavailable.
 */
@Injectable()
export class ClaudeIntentParser extends IntentParser {
  readonly name = "claude";
  private readonly logger = new Logger(ClaudeIntentParser.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(
    config: ConfigService,
    private readonly fallback: RuleBasedIntentParser,
  ) {
    super();
    // Short commands should come back fast; don't stack long retries behind a driver waiting.
    this.client = new Anthropic({ apiKey: config.get("ANTHROPIC_API_KEY"), timeout: 20_000, maxRetries: 1 });
    this.model = config.get("VOICE_MODEL") || DEFAULT_MODEL;
  }

  async parse(transcript: string, context: VoiceContext | null): Promise<VoiceIntent> {
    const load = context
      ? `Current load: pickup at ${context.pickup} (${context.pickedUp ? "already picked up" : "not picked up yet"}), delivery at ${context.delivery}.`
      : "The driver has no load assigned.";

    try {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 4096,
        betas: ["server-side-fallback-2026-07-01"],
        // On a safety decline the API retries on Anthropic's recommended fallback model.
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: INTENT_SCHEMA } },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `${load}\n\nTranscript: ${transcript}` }],
      });

      if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
        this.logger.warn(`Voice parsing stopped with ${response.stop_reason}; using keyword parser`);
        return this.fallback.parse(transcript);
      }
      const text = response.content.find((block) => block.type === "text");
      const raw = text ? (JSON.parse(text.text) as RawIntent) : null;
      if (!raw || !(VOICE_ACTIONS as readonly string[]).includes(raw.action)) {
        return this.fallback.parse(transcript);
      }
      return {
        action: raw.action as VoiceIntent["action"],
        delayMinutes: raw.delay_minutes,
        reason: raw.reason,
        location: raw.location,
        clarification: raw.clarification,
      };
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        this.logger.warn("Voice parsing rate limited; using keyword parser");
      } else if (err instanceof Anthropic.APIError) {
        this.logger.warn(`Voice parsing failed (${err.status}): ${err.message}; using keyword parser`);
      } else if (err instanceof SyntaxError) {
        this.logger.warn("Voice parsing returned invalid JSON; using keyword parser");
      } else {
        throw err;
      }
      return this.fallback.parse(transcript);
    }
  }
}
