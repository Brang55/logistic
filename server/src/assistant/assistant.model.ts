import Anthropic from "@anthropic-ai/sdk";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const DEFAULT_MODEL = "claude-opus-5-5";

export type ModelRequest = Pick<
  Anthropic.Beta.MessageCreateParamsNonStreaming,
  "system" | "tools" | "messages"
>;

/** The language model behind the assistant; tests replace it with a scripted fake. */
export abstract class AssistantModel {
  abstract readonly enabled: boolean;
  abstract readonly name: string;
  abstract create(request: ModelRequest): Promise<Anthropic.Beta.BetaMessage>;
}

@Injectable()
export class ClaudeAssistantModel extends AssistantModel {
  readonly enabled: boolean;
  readonly name: string;
  private readonly client: Anthropic;

  constructor(config: ConfigService) {
    super();
    this.enabled = !!config.get("ANTHROPIC_API_KEY");
    this.name = config.get("ASSISTANT_MODEL") || DEFAULT_MODEL;
    // Someone is waiting on every turn; don't stack long retries behind them.
    this.client = new Anthropic({ apiKey: config.get("ANTHROPIC_API_KEY"), timeout: 30_000, maxRetries: 1 });
  }

  create(request: ModelRequest) {
    return this.client.beta.messages.create({
      model: this.name,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      // On a safety decline the API retries on Anthropic's recommended fallback model.
      fallbacks: "default",
      // Lookups and short replies: low effort keeps voice commands quick.
      output_config: { effort: "low" },
      // Caches the tools, system prompt and conversation so far between the steps of a turn.
      cache_control: { type: "ephemeral" },
      ...request,
    });
  }
}
