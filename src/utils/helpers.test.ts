import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";
import { groupMessages } from "./notices";
import { isFinished } from "./status";

describe("errorMessage", () => {
  it("uses the API's message", () => {
    expect(errorMessage({ status: 409, data: { message: "Record already exists" } })).toBe("Record already exists");
  });

  it("joins validation messages", () => {
    expect(errorMessage({ data: { message: ["weight must be a number", "pickupDate must be a date"] } })).toBe(
      "weight must be a number, pickupDate must be a date"
    );
  });

  it("falls back when there is no usable message", () => {
    expect(errorMessage(undefined, "Could not save.")).toBe("Could not save.");
    expect(errorMessage({ status: "FETCH_ERROR", error: "offline" }, "Could not save.")).toBe("Could not save.");
    expect(errorMessage({ data: { message: "" } })).toBe("Something went wrong. Try again.");
  });
});

describe("groupMessages", () => {
  it("counts repeats and keeps first-seen order", () => {
    expect(groupMessages(["Too tall", "Too heavy", "Too tall"])).toEqual([
      { message: "Too tall", count: 2 },
      { message: "Too heavy", count: 1 },
    ]);
    expect(groupMessages([])).toEqual([]);
  });
});

describe("isFinished", () => {
  it("is true only for delivered and cancelled cargo", () => {
    expect((["delivered", "cancelled"] as const).every(isFinished)).toBe(true);
    expect((["new", "edited", "confirmed", "picked_up"] as const).some(isFinished)).toBe(false);
  });
});
