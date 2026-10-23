import { describe, expect, it } from "vitest";
import { series, totalOf, valueAt, type AcquisitionBase } from "./acquisition.ts";

const base: AcquisitionBase = {
  schema_version: 1,
  as_of: "2026-10-23",
  months: ["2026-08-01", "2026-09-01", "2026-10-01"],
  partial: true,
  reps: ["Ann", "Bob"],
  types: ["Liquor store", "Gas station"],
  cells: [
    // Ann, liquor: 2 acquired in Aug, 1 in Oct; 10 prospects today.
    { rep: 0, type: 0, market: 20, acquired: [2, 0, 1], prospectsStart: [13, 11, 11], activeEnd: [7, 7, 8] },
    { rep: 0, type: 1, market: 5, acquired: [0, 1, 0], prospectsStart: [4, 4, 3], activeEnd: [1, 2, 2] },
    { rep: 1, type: 0, market: 10, acquired: [1, 1, 1], prospectsStart: [8, 7, 6], activeEnd: [2, 3, 4] },
  ],
};

describe("acquisition series", () => {
  it("adds up reps and the total over the kept store types", () => {
    const all = series(base, []);
    expect(all.reps[0]!.acquired).toEqual([2, 1, 1]);
    expect(all.total.market).toBe(35);
    const liquor = series(base, [0]);
    expect(liquor.reps[0]!.acquired).toEqual([2, 0, 1]);
    expect(liquor.total.prospectsStart).toEqual([21, 18, 17]);
  });

  it("measures a month as stores, rate against prospects at its start, or penetration at its end", () => {
    const ann = series(base, []).reps[0]!;
    expect(valueAt(ann, 0, "stores")).toBe(2);
    expect(valueAt(ann, 0, "rate")).toBeCloseTo(2 / 17);
    expect(valueAt(ann, 2, "penetration")).toBeCloseTo(10 / 25);
  });

  it("sums the window: all stores acquired, over the prospects at its start, and the last penetration", () => {
    const ann = series(base, []).reps[0]!;
    expect(totalOf(ann, "stores")).toBe(4);
    expect(totalOf(ann, "rate")).toBeCloseTo(4 / 17);
    expect(totalOf(ann, "penetration")).toBeCloseTo(10 / 25);
  });
});
