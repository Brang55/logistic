import { ConfigService } from "@nestjs/config";
import { ClaudeIntentParser } from "./claude.parser";
import { RuleBasedIntentParser } from "./rule-based.parser";

describe("ClaudeIntentParser", () => {
  let create: jest.Mock;
  let parser: ClaudeIntentParser;

  beforeEach(() => {
    parser = new ClaudeIntentParser(new ConfigService({ ANTHROPIC_API_KEY: "test" }), new RuleBasedIntentParser());
    create = jest.fn();
    // Replace the SDK call; no network in unit tests.
    (parser as unknown as { client: unknown }).client = { beta: { messages: { create } } };
  });

  const reply = (json: object, stop_reason = "end_turn") => ({
    stop_reason,
    content: [{ type: "text", text: JSON.stringify(json) }],
  });

  it("maps the structured answer and sends the trip context", async () => {
    create.mockResolvedValue(
      reply({ action: "report_delay", delay_minutes: 40, reason: "Stau", location: null, clarification: null }),
    );
    const intent = await parser.parse("Ich bin 40 Minuten zu spät wegen Stau", {
      pickup: "Munich",
      delivery: "Vienna",
      pickedUp: true,
    });

    expect(intent).toEqual({ action: "report_delay", delayMinutes: 40, reason: "Stau", location: null, clarification: null });
    const request = create.mock.calls[0][0];
    expect(request).toMatchObject({
      model: "claude-opus-5-5",
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
      output_config: { effort: "low", format: { type: "json_schema" } },
    });
    expect(request.messages[0].content).toContain("already picked up");
  });

  it("falls back to the keyword parser on a refusal", async () => {
    create.mockResolvedValue({ stop_reason: "refusal", content: [] });
    expect(await parser.parse("picked up the load", null)).toMatchObject({ action: "confirm_pickup" });
  });

  it("falls back when the answer names an unknown action", async () => {
    create.mockResolvedValue(reply({ action: "launch_rocket", delay_minutes: null, reason: null, location: null, clarification: null }));
    expect(await parser.parse("delivered", null)).toMatchObject({ action: "confirm_delivery" });
  });
});
