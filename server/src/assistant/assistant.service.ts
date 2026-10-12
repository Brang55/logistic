import Anthropic from "@anthropic-ai/sdk";
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AuthUser } from "../auth/auth-user";
import { UserRole } from "../db/schema";
import { AssistantModel } from "./assistant.model";
import { AssistantStore, Conversation, PendingAction } from "./assistant.store";
import { AssistantTool, ExecuteOptions, ToolInput, UiAction } from "./assistant.types";
import { RuleBasedIntentParser } from "./fallback/rule-based.parser";
import { ReplyLinker } from "./reply-links";
import { CargoTools } from "./tools/cargo.tools";
import { DriverTools } from "./tools/driver.tools";
import { FleetTools } from "./tools/fleet.tools";
import { NavigationTools, PAGES } from "./tools/navigation.tools";

// Enough for "find the load, find the truck, propose the assignment" with room for a retry.
const MAX_STEPS = 8;

// Pages a reply may link to, e.g. "[Traffic](/traffic)".
const PAGE_LINKS = Object.values(PAGES)
  .filter((page) => !page.needsId)
  .map((page) => `[${page.label}](${page.path})`)
  .join(", ");

// Frozen so the tools + system prefix stays cacheable; per-request context goes in the user message.
const STAFF_PROMPT = `You are the assistant in a US trucking company's fleet and dispatch app. Dispatchers and admins type or speak to you, so expect speech-recognition mistakes ("track 12" may mean truck 12).

How to format replies (they are shown in a narrow side panel, and the first sentence is read aloud when the user spoke):
- Start with one sentence that answers the question directly, e.g. "**2 loads** were delivered in October and **1** was late."
- Then, only when there is more to show, give the details in markdown: a "###" heading for each part of a question with several parts (e.g. "Delivered", "Scheduled", "Delays"); a table when several items share the same fields (e.g. Load | Route | Date | Status), with short dates like "Oct 3" and at most 4 columns; otherwise a short bullet list.
- **Bold** counts and anything that needs attention. No long paragraphs. Show at most 15 rows; say how many more there are and offer to open the page that lists them.
- A simple answer or a proposal needs only the one sentence.
- Mention loads by their SH- reference and trucks or trailers by their number; they become links to their pages automatically, so don't link them yourself. To point to a page, link it with one of these: ${PAGE_LINKS}.

Look things up with the tools instead of guessing ids, numbers or statuses. Resolve truck numbers, driver names, cities and SH- references with the find_* tools before using an id. If several things match and the request doesn't say which, ask a short question that names the options.

Tools that change data (create_cargo, update_cargo, assign_cargo, confirm_cargo) don't run straight away: each call becomes a proposal the user confirms or cancels with a button. After proposing, say in one sentence what you proposed; never say it is done. Propose only what the user asked for. The next message tells you whether they confirmed or cancelled.

Use US units (miles, pounds, feet); weights given without a unit are pounds. Say dates like "Tue, Oct 14". Each user message starts with today's date and the page they have open; "this load" or "this truck" means the one on that page.`;

const DRIVER_PROMPT = `You are the voice assistant in the driver app of a US trucking company. The driver is usually behind the wheel and speaking, so the text comes from speech recognition: expect missing punctuation and misheard words. It may be in any language; reply in the driver's language. Replies are read aloud: one or two short sentences of plain text, no lists or markdown. Never ask the driver to read or type anything long.

Each message starts with today's date and the driver's current load, so common commands need no lookup. Use my_trip for details such as miles left, the trailer or route restrictions, and road_reports for what other drivers reported.

Tools that change something (report_delay, confirm_pickup, confirm_delivery, change_stop_address, report_road_issue, message_dispatch, post_to_driver_chat, add_logbook_entry) don't run straight away: each becomes a card the driver confirms with a tap. After proposing, say in one short sentence what you proposed, as a question; never say it is done. Propose only what the driver asked for. The next message tells you whether they confirmed or cancelled.

Use US units (miles, pounds). If a request is unclear, ask one short question.`;

export interface ActionView {
  id: string;
  /** The client needs it for tool-specific handling, such as assign_cargo's truck restrictions. */
  tool: string;
  title: string;
  summary: string;
  details: string[];
  warnings: string[];
  expiresAt: string;
}

export interface AssistantReply {
  conversationId: string;
  reply: string;
  actions: ActionView[];
  ui: UiAction[];
}

/** Claude couldn't be reached or declined the request; drivers fall back to the keyword parser. */
class ModelUnavailable extends Error {
  constructor(readonly reason: "busy" | "down" | "declined") {
    super(`The assistant model is unavailable (${reason})`);
  }
}

const view = (action: PendingAction): ActionView => ({
  id: action.id,
  tool: action.tool,
  ...action.proposal,
  expiresAt: new Date(action.expiresAt).toISOString(),
});

const today = () => {
  const now = new Date();
  const spoken = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `${spoken} (${iso})`;
};

/**
 * Typed or spoken requests from staff and drivers. Claude looks things up with read tools and
 * proposes changes with write tools; a change runs only when the user confirms it, through the
 * same service methods the regular screens use (so validation, restriction checks and alerts apply).
 * Without Claude, drivers still get the keyword parser for the common commands.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly tools: AssistantTool[];

  constructor(
    private readonly model: AssistantModel,
    private readonly store: AssistantStore,
    private readonly rules: RuleBasedIntentParser,
    private readonly driver: DriverTools,
    private readonly linker: ReplyLinker,
    cargo: CargoTools,
    fleet: FleetTools,
    navigation: NavigationTools,
  ) {
    this.tools = [...cargo.tools(), ...fleet.tools(), ...navigation.tools(), ...driver.tools()];
  }

  status(user: AuthUser) {
    const keywords = !this.model.enabled && user.role === "driver";
    return { enabled: this.model.enabled || keywords, model: this.model.enabled ? this.model.name : keywords ? "keywords" : null };
  }

  async message(user: AuthUser, text: string, conversationId?: string, page?: string): Promise<AssistantReply> {
    const conversation = this.store.conversation(user.id, conversationId);
    // A new request replaces whatever was proposed before and not yet confirmed.
    this.store.withdrawPending(conversation.id);
    const isDriver = user.role === "driver";
    if (!this.model.enabled) {
      if (isDriver) return this.withKeywords(user, conversation, text);
      throw new ServiceUnavailableException("The assistant isn't set up: the server needs an ANTHROPIC_API_KEY.");
    }
    try {
      const result = await this.converse(user, conversation, text, page);
      // Only what the user sees gets links; the stored history keeps Claude's own words.
      return { ...result, reply: await this.linker.link(result.reply, user.role) };
    } catch (err) {
      if (!(err instanceof ModelUnavailable)) throw err;
      if (isDriver) return this.withKeywords(user, conversation, text);
      if (err.reason === "declined") return { conversationId: conversation.id, reply: "Sorry, I can't help with that one.", actions: [], ui: [] };
      throw err.reason === "busy"
        ? new ServiceUnavailableException("The assistant is busy. Try again in a moment.")
        : new BadGatewayException("The assistant is unavailable right now. Try again in a moment.");
    }
  }

  /** Runs a proposed action the user confirmed. A restriction conflict (409) leaves it pending. */
  async confirm(user: AuthUser, id: string, options: ExecuteOptions) {
    const action = this.pending(user, id);
    const tool = this.toolsFor(user.role).find((t) => t.name === action.tool);
    if (tool?.kind !== "write") throw new ForbiddenException();
    const result = await tool.execute(action.input, user, options);
    this.store.settle(action, `The user confirmed "${action.proposal.summary}". Result: ${result.message}`);
    return result;
  }

  cancel(user: AuthUser, id: string) {
    const action = this.pending(user, id);
    this.store.settle(action, `The user cancelled "${action.proposal.summary}"; it was not done.`);
    return { message: "Cancelled." };
  }

  private async converse(user: AuthUser, conversation: Conversation, text: string, page?: string): Promise<AssistantReply> {
    const tools = this.toolsFor(user.role);
    const definitions = tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
    const system = user.role === "driver" ? DRIVER_PROMPT : STAFF_PROMPT;
    const context = [
      `Today is ${today()}.`,
      user.role === "driver" ? await this.driver.contextLine(user) : `Open page: ${page || "unknown"}.`,
      ...conversation.notes,
    ].join("\n");

    // Worked on a copy: a failed turn leaves the stored history as it was.
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...conversation.messages,
      { role: "user", content: [{ type: "text", text: context }, { type: "text", text }] },
    ];
    const actions: PendingAction[] = [];
    const ui: UiAction[] = [];
    const commit = (reply: string): AssistantReply => {
      conversation.messages = messages;
      conversation.notes = [];
      return { conversationId: conversation.id, reply, actions: actions.map(view), ui };
    };

    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await this.call({ system, tools: definitions, messages });
      messages.push({ role: "assistant", content: response.content });

      const calls = response.content.filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use");
      if (response.stop_reason !== "tool_use" || !calls.length) {
        const reply = response.content
          .flatMap((block) => (block.type === "text" ? [block.text] : []))
          .join("\n")
          .trim();
        return commit(reply || (actions.length ? "Please check and confirm." : "Done."));
      }

      const context = { user, tools, conversationId: conversation.id, actions, ui };
      const results = await Promise.all(calls.map((call) => this.runTool(call, context)));
      messages.push({ role: "user", content: results });
    }
    return commit("That took too many steps. Try asking for one thing at a time.");
  }

  /** The driver commands the keyword parser understands, proposed the same way Claude would. */
  private async withKeywords(user: AuthUser, conversation: Conversation, text: string): Promise<AssistantReply> {
    const reply = (message: string, actions: PendingAction[] = []) => ({
      conversationId: conversation.id,
      reply: message,
      actions: actions.map(view),
      ui: [],
    });
    const propose = async (toolName: string, input: ToolInput) => {
      const actions: PendingAction[] = [];
      const result = await this.runTool(
        { type: "tool_use", id: "keywords", name: toolName, input, caller: { type: "direct" } },
        { user, tools: this.toolsFor(user.role), conversationId: conversation.id, actions, ui: [] },
      );
      return actions.length ? reply(`${actions[0].proposal.summary}?`, actions) : reply(result.content as string);
    };

    const intent = this.rules.parse(text);
    switch (intent.action) {
      case "next_stop":
        return reply(await this.driver.nextStopReply(user));
      case "unknown":
        return reply(intent.clarification ?? "Sorry, I didn't get that.");
      case "report_delay":
        return intent.delayMinutes
          ? propose("report_delay", { minutes: intent.delayMinutes, reason: intent.reason })
          : reply("How many minutes late will you be?");
      case "confirm_pickup":
        return propose("confirm_pickup", {});
      case "confirm_delivery":
        return propose("confirm_delivery", {});
      case "set_pickup_location":
      case "set_delivery_location":
        return propose("change_stop_address", {
          stop: intent.action === "set_pickup_location" ? "pickup" : "delivery",
          address: intent.location,
        });
      case "road_report":
        return propose("report_road_issue", { type: intent.reportType });
    }
  }

  private pending(user: AuthUser, id: string) {
    const action = this.store.action(user.id, id);
    if (!action) throw new NotFoundException("This action expired or was already handled. Ask again.");
    return action;
  }

  private toolsFor(role: UserRole) {
    return this.tools.filter((tool) => tool.roles.includes(role));
  }

  private async call(request: Parameters<AssistantModel["create"]>[0]) {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.model.create(request);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        this.logger.warn("Assistant rate limited");
        throw new ModelUnavailable("busy");
      }
      if (err instanceof Anthropic.APIError) {
        this.logger.warn(`Assistant request failed (${err.status}): ${err.message}`);
        throw new ModelUnavailable("down");
      }
      throw err;
    }
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      this.logger.warn(`Assistant turn stopped with ${response.stop_reason}`);
      throw new ModelUnavailable("declined");
    }
    return response;
  }

  private async runTool(
    call: Anthropic.Beta.BetaToolUseBlock,
    context: { user: AuthUser; tools: AssistantTool[]; conversationId: string; actions: PendingAction[]; ui: UiAction[] },
  ): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
    const input = (call.input ?? {}) as ToolInput;
    const result = (content: string, isError = false) => ({
      type: "tool_result" as const,
      tool_use_id: call.id,
      content,
      ...(isError && { is_error: true }),
    });
    try {
      const tool = context.tools.find((t) => t.name === call.name);
      if (!tool) throw new BadRequestException(`There is no tool called ${call.name}`);
      switch (tool.kind) {
        case "read":
          return result(JSON.stringify(await tool.run(input, context.user)));
        case "ui": {
          const action = tool.action(input);
          context.ui.push(action);
          return result(`Opened ${action.label} for the user.`);
        }
        case "write": {
          const { input: resolved, ...proposal } = await tool.prepare(input, context.user);
          const action = this.store.propose({
            userId: context.user.id,
            conversationId: context.conversationId,
            tool: tool.name,
            input: resolved ?? input,
            proposal,
          });
          context.actions.push(action);
          const warnings = proposal.warnings.length ? ` Warnings shown to the user: ${proposal.warnings.join(" ")}` : "";
          return result(`Proposed to the user, not done yet: ${proposal.summary}.${warnings}`);
        }
      }
    } catch (err) {
      // Bad ids, unknown loads and invalid fields go back to Claude so it can correct itself.
      if (err instanceof HttpException) return result(err.message, true);
      this.logger.error(`Assistant tool ${call.name} failed`, err instanceof Error ? err.stack : String(err));
      return result("The tool failed unexpectedly.", true);
    }
  }
}
