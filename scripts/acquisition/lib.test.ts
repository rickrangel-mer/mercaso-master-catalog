import { describe, expect, it } from "vitest";
import { activeAt, monthEnd, monthIndex, monthStarts } from "./lib.ts";

describe("months", () => {
  it("lists the months ending with the as-of month, across a year end", () => {
    expect(monthStarts("2026-10-23", 13)).toEqual([
      "2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01",
      "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01",
    ]);
  });
  it("ends a month on its last day, or on the as-of date", () => {
    expect(monthEnd("2026-02-01", "2026-10-23")).toBe("2026-02-28");
    expect(monthEnd("2026-10-01", "2026-10-23")).toBe("2026-10-23");
  });
  it("places dates before, in and after the window", () => {
    const s = monthStarts("2026-10-23", 13);
    expect(monthIndex("2025-09-30", s)).toBe(-1);
    expect(monthIndex("2026-07-15", s)).toBe(9);
    expect(monthIndex("2026-11-02", s)).toBe(13);
  });
});

describe("activeAt", () => {
  it("is active when the last order up to the date is within 45 days", () => {
    const days = ["2026-05-01", "2026-06-20", "2026-08-30"];
    expect(activeAt(days, "2026-07-31")).toBe(true); // 41 days after Jun 20
    expect(activeAt(days, "2026-08-10")).toBe(false); // 51 days, the Aug 30 order is later
    expect(activeAt(days, "2026-04-30")).toBe(false);
  });
});
