import { parseMinutes, RuleBasedIntentParser } from "./rule-based.parser";

describe("RuleBasedIntentParser", () => {
  const parser = new RuleBasedIntentParser();
  const parse = (text: string) => parser.parse(text);

  it.each([
    ["I will have a delayed pickup", { action: "report_delay", delayMinutes: null }],
    ["I'm running 45 minutes late because of traffic on the A1", { action: "report_delay", delayMinutes: 45, reason: "traffic on the A1" }],
    ["stuck at the border, about an hour and a half behind", { action: "report_delay", delayMinutes: 90 }],
    ["I'll be half an hour late", { action: "report_delay", delayMinutes: 30 }],
    ["two hours delay due to a road closure", { action: "report_delay", delayMinutes: 120, reason: "a road closure" }],
    ["Set the next pickup destination to Sofia Airport Cargo Terminal", { action: "set_pickup_location", location: "Sofia Airport Cargo Terminal" }],
    ["set the delivery destination to Lidl warehouse, Plovdiv please", { action: "set_delivery_location", location: "Lidl warehouse, Plovdiv" }],
    ["change delivery address to Rotterdam port gate 4", { action: "set_delivery_location", location: "Rotterdam port gate 4" }],
    ["Picked up the load", { action: "confirm_pickup" }],
    ["delivered", { action: "confirm_delivery" }],
    ["what's my next stop", { action: "next_stop" }],
    ["sing me a song", { action: "unknown" }],
  ])("understands %p", async (text, expected) => {
    expect(await parse(text)).toMatchObject(expected);
  });

  it("parses durations in words and digits", () => {
    expect(parseMinutes("twenty minutes")).toBe(20);
    expect(parseMinutes("1.5 hours")).toBe(90);
    expect(parseMinutes("15 min")).toBe(15);
    expect(parseMinutes("no number here")).toBeNull();
  });
});
