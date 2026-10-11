import { describe, expect, it } from "vitest";
import {
  formatCargoWeight,
  formatDistance,
  formatLength,
  formatMiles,
  formatSpeed,
  formatWeight,
  ftToM,
  kgToLb,
  lbToKg,
  lbToT,
  mToFt,
  tToLb,
  toInputValue,
} from "./units";

describe("unit conversions", () => {
  it("round-trips between metric storage and US units", () => {
    expect(ftToM(mToFt(4.11))).toBeCloseTo(4.11, 10);
    expect(lbToKg(kgToLb(18_143.7))).toBeCloseTo(18_143.7, 10);
    expect(tToLb(lbToT(80_000))).toBeCloseTo(80_000, 6);
  });

  it("uses the exact US definitions", () => {
    expect(mToFt(0.3048)).toBe(1);
    expect(lbToKg(1)).toBe(0.45359237);
    // An 80,000 lb rig is about 36.3 metric tons.
    expect(lbToT(80_000)).toBeCloseTo(36.287, 3);
  });
});

describe("formatDistance", () => {
  it("uses feet below a tenth of a mile", () => {
    expect(formatDistance(30)).toBe("98 ft");
  });

  it("uses one decimal below 100 miles and whole miles above", () => {
    expect(formatDistance(20_000)).toBe("12.4 mi");
    expect(formatDistance(2_003_000)).toBe("1,245 mi");
  });
});

describe("formatting", () => {
  it("shows truck dimensions in feet and inches", () => {
    expect(formatLength(4.11)).toBe("13′ 6″");
    expect(formatLength(3.6576)).toBe("12′");
  });

  it("shows weights, speeds and odometers in US units", () => {
    expect(formatWeight(18_143.7)).toBe("40,000 lb");
    expect(formatSpeed(100)).toBe("62 mph");
    expect(formatMiles(100)).toBe("62 mi");
  });
});

describe("toInputValue", () => {
  it("is empty for unset values", () => {
    expect(toInputValue(null, mToFt)).toBe("");
    expect(toInputValue(undefined, mToFt)).toBe("");
  });

  it("converts with the requested precision and drops trailing zeros", () => {
    expect(toInputValue(4.11, mToFt, 1)).toBe("13.5");
    // A weight entered as 80,000 lb is stored in tons and shows as 80,000 again.
    expect(toInputValue(lbToT(80_000), tToLb)).toBe("80000");
    expect(toInputValue(0, mToFt, 1)).toBe("0");
  });
});

describe("formatCargoWeight", () => {
  it("converts numeric kilograms and leaves free text alone", () => {
    expect(formatCargoWeight("18143.7")).toBe("40,000 lb");
    expect(formatCargoWeight("20 pallets")).toBe("20 pallets");
    expect(formatCargoWeight("")).toBe("");
    expect(formatCargoWeight("   ")).toBe("   ");
  });
});
