import { describe, expect, it } from "vitest";
import { series, type AcquisitionBase } from "./acquisition.ts";
import { acquisitionRows, cell, marketRows, toCsv } from "./exportTables.ts";
import { computeMarket, type MarketBase } from "./market.ts";

describe("CSV helpers", () => {
  it("rounds cells and quotes values that need it", () => {
    expect(cell(3)).toBe("3");
    expect(cell(0.123456, 4)).toBe("0.1235");
    expect(cell(NaN)).toBe("");
    expect(toCsv([["a", "b,c"], ['say "hi"', "x"]])).toBe('a,"b,c"\r\n"say ""hi""",x\r\n');
  });
});

describe("marketRows", () => {
  const base: MarketBase = {
    schema_version: 1,
    as_of: "2026-10-23",
    zones: ["North"],
    areas: ["N1"],
    areaZone: [0],
    types: [{ name: "Liquor store", newStore: 50_000, newStoreLow: 30_000, margin: 0.1 }],
    reps: ["Ann"],
    cells: [[0, 0, 0, 0, 10, 500_000, 50_000, 4, 2, 80_000, 8_000, 30]],
  };
  const r = computeMarket(base, { driver: "zone", spend: "average", newShort: [null], newLong: [null], backShort: [null], backLong: [null] });
  it("writes the total and every group, with dollars only in the priced build", () => {
    const rows = marketRows(base, r);
    expect(rows[0]).toContain("revenue_added_12mo");
    expect(rows[1]!.slice(0, 5)).toEqual(["total", "All stores", "", "42", "10"]);
    expect(rows.filter((x) => x[0] === "sub-area")[0]![2]).toBe("North");
    expect(marketRows({ ...base, no_money: true }, r)[0]).not.toContain("revenue_today");
  });
});

describe("acquisitionRows", () => {
  const base: AcquisitionBase = {
    schema_version: 1,
    as_of: "2026-10-23",
    months: ["2026-09-01", "2026-10-01"],
    partial: true,
    reps: ["Ann"],
    types: ["Liquor store"],
    cells: [{ rep: 0, type: 0, market: 20, acquired: [2, 1], prospectsStart: [10, 8], activeEnd: [5, 6] }],
  };
  it("writes one row per rep and month, the partial month marked", () => {
    const { reps, total } = series(base, []);
    const rows = acquisitionRows(base, reps, total);
    expect(rows).toHaveLength(1 + 2 * 2);
    expect(rows[1]).toEqual(["Ann", "2026-09", "", "2", "10", "0.2000", "5", "20", "0.2500"]);
    expect(rows[2]![2]).toBe("to 2026-10-23");
  });
});
