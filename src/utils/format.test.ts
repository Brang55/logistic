import { describe, expect, it } from "vitest";
import { formatAge, formatDuration } from "./format";

describe("formatDuration", () => {
  it("rounds to whole minutes and adds hours when needed", () => {
    expect(formatDuration(29)).toBe("0 min");
    expect(formatDuration(59)).toBe("1 min");
    expect(formatDuration(3600)).toBe("1 h 0 min");
    expect(formatDuration(5400)).toBe("1 h 30 min");
  });
});

describe("formatAge", () => {
  const now = Date.parse("2026-10-11T12:00:00Z");
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it("describes recent times relative to now", () => {
    expect(formatAge(ago(30), now)).toBe("just now");
    expect(formatAge(ago(5 * 60), now)).toBe("5 min ago");
    expect(formatAge(ago(3 * 3600), now)).toBe("3 h ago");
  });

  it("treats times slightly in the future (clock skew) as just now", () => {
    expect(formatAge(ago(-20), now)).toBe("just now");
  });

  it("shows a date for anything older than a day", () => {
    const old = ago(2 * 86_400);
    expect(formatAge(old, now)).toBe(new Date(old).toLocaleDateString());
  });
});
