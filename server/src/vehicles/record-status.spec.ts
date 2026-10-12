import { addDays, documentStatus, maintenanceDue } from "./record-status";

const ON = "2026-10-09";

describe("record status", () => {
  it("classifies document expiry", () => {
    expect(documentStatus(null, ON)).toEqual({ status: "no_expiry", daysLeft: null });
    expect(documentStatus("2026-10-01", ON)).toEqual({ status: "expired", daysLeft: -8 });
    expect(documentStatus("2026-10-21", ON)).toEqual({ status: "expiring", daysLeft: 12 });
    expect(documentStatus("2027-01-01", ON)).toMatchObject({ status: "valid" });
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
  });

  it("uses whichever of date and distance comes first", () => {
    const oil = { intervalDays: 365, intervalKm: 60000, lastDoneOn: "2026-06-01", lastDoneKm: 100000 };
    expect(maintenanceDue(oil, 120000, ON)).toMatchObject({ status: "ok", nextDueOn: "2027-06-01", nextDueKm: 160000, kmLeft: 40000 });
    expect(maintenanceDue(oil, 158500, ON)).toMatchObject({ status: "due_soon", kmLeft: 1500 });
    expect(maintenanceDue(oil, 161000, ON)).toMatchObject({ status: "overdue", kmLeft: -1000 });
    expect(maintenanceDue({ ...oil, lastDoneOn: "2025-10-01" }, 120000, ON)).toMatchObject({ status: "overdue", daysLeft: -8 });
  });

  it("reports checks that were never done", () => {
    expect(maintenanceDue({ intervalDays: 365, intervalKm: null, lastDoneOn: null, lastDoneKm: null }, null, ON)).toMatchObject({
      status: "not_started",
    });
  });
});
