import Anthropic from "@anthropic-ai/sdk";
import { AssistantModel, ModelRequest } from "../../src/assistant/assistant.model";

type Step = (request: ModelRequest) => Partial<Anthropic.Beta.BetaMessage>;

/** Stands in for Claude: each call returns the next scripted step, which can read the request so far. */
export class ScriptedModel extends AssistantModel {
  readonly enabled = true;
  readonly name = "scripted";
  readonly requests: ModelRequest[] = [];
  private steps: Step[] = [];

  script(...steps: Step[]) {
    this.steps = steps;
    this.requests.length = 0;
  }

  async create(request: ModelRequest) {
    // Copy, since the service keeps appending to the same messages array.
    this.requests.push({ ...request, messages: [...request.messages] });
    const step = this.steps.shift();
    if (!step) throw new Error("ScriptedModel ran out of steps");
    return step(request) as Anthropic.Beta.BetaMessage;
  }
}

let ids = 0;

export const callTool =
  (name: string, input: Record<string, unknown> | ((request: ModelRequest) => Record<string, unknown>)): Step =>
  (request) => ({
    stop_reason: "tool_use",
    content: [
      { type: "tool_use", id: `toolu_${++ids}`, name, input: typeof input === "function" ? input(request) : input },
    ] as Anthropic.Beta.BetaContentBlock[],
  });

export const say =
  (text: string): Step =>
  () => ({ stop_reason: "end_turn", content: [{ type: "text", text, citations: null }] as Anthropic.Beta.BetaContentBlock[] });

/** The tool results the model received in its latest request. */
export const lastToolResults = (request: ModelRequest) => {
  const last = request.messages[request.messages.length - 1];
  return (last.content as Anthropic.Beta.BetaToolResultBlockParam[]).map((block) => ({
    isError: !!block.is_error,
    content: block.content as string,
  }));
};

/** The parsed result of the latest read tool. */
export const lastResult = <T>(request: ModelRequest): T => JSON.parse(lastToolResults(request)[0].content) as T;

/** All the text the user sent in the latest message (context lines and the request). */
export const lastUserText = (request: ModelRequest) => {
  const last = request.messages[request.messages.length - 1];
  return (last.content as Anthropic.Beta.BetaTextBlockParam[]).map((block) => block.text).join("\n");
};
