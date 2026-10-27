import { describe, expect, it } from "vitest";
import { isChurned, isCustomer, lastOrderBy, storeEvents } from "./lib.ts";

describe("storeEvents", () => {
  it("marks a new store, a save after 45-89 days, and a churn then win-back after 90+", () => {
    const days = ["2026-01-05", "2026-01-20", "2026-03-20", "2026-08-01"];
    expect(storeEvents("2026-01-05", days, "2026-09-15")).toEqual([
      { kind: "new", date: "2026-01-05" },
      { kind: "saved", date: "2026-03-20" }, // 59 days after Jan 20
      { kind: "churned", date: "2026-06-18" }, // 90 days after Mar 20
      { kind: "won back", date: "2026-08-01" },
    ]);
  });
  it("churns a store 90 days after its last order, once that day has come", () => {
    expect(storeEvents("2026-05-01", ["2026-05-01"], "2026-08-15").map((e) => e.kind)).toEqual(["new", "churned"]);
    expect(storeEvents("2026-05-01", ["2026-05-01"], "2026-07-15").map((e) => e.kind)).toEqual(["new"]);
  });
});

describe("customer state", () => {
  const days = ["2026-01-05", "2026-06-01"];
  it("finds the last order by a date and tells customers from churned stores", () => {
    expect(lastOrderBy(days, "2026-05-31")).toBe("2026-01-05");
    expect(lastOrderBy(days, "2026-01-01")).toBeUndefined();
    expect(isCustomer(days, "2026-03-31")).toBe(true); // 85 days
    expect(isCustomer(days, "2026-04-30")).toBe(false);
    expect(isChurned(days, "2026-04-30")).toBe(true);
    expect(isChurned(days, "2026-06-30")).toBe(false);
    expect(isChurned(days, "2025-12-31")).toBe(false); // never ordered yet
  });
});
