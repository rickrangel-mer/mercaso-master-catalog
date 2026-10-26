import { describe, expect, it } from "vitest";
import { computeMarket, type MarketBase, type MarketSettings } from "./market.ts";

// Two zones, one sub-area each, two types, one rep.
const base: MarketBase = {
  schema_version: 1,
  as_of: "2026-10-23",
  zones: ["North", "South"],
  areas: ["N1", "S1"],
  areaZone: [0, 1],
  types: [
    { name: "Liquor store", newStore: 50_000, newStoreLow: 30_000, margin: 0.1 },
    { name: "Gas station", newStore: 20_000, newStoreLow: 10_000, margin: 0.2 },
  ],
  reps: ["Ann"],
  // [zone, area, type, rep, active, activeRevenue, activeProfit, newPace, churned, churnedRevenue, churnedProfit, prospects]
  cells: [
    [0, 0, 0, 0, 10, 500_000, 50_000, 4, 4, 160_000, 16_000, 30],
    [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 10],
    [1, 1, 0, 0, 5, 250_000, 25_000, 2, 0, 0, 0, 45],
  ],
};
const settings = (extra: Partial<MarketSettings> = {}): MarketSettings => ({
  driver: "zone",
  spend: "average",
  newShort: [null, null],
  newLong: [null, null],
  backShort: [null, null],
  backLong: [null, null],
  ...extra,
});

describe("computeMarket", () => {
  it("measures today's penetration per group and in total", () => {
    const r = computeMarket(base, settings());
    expect(r.total.market).toBe(104);
    expect(r.total.today).toBeCloseTo(15 / 104);
    expect(r.groups.zone[0]!.today).toBeCloseTo(10 / 54);
    expect(r.groups.type[1]!.market).toBe(10);
  });

  it("defaults to last year's pace of new stores and no win-backs", () => {
    const r = computeMarket(base, settings());
    expect(r.groups.zone[0]!.newLong).toBeCloseTo(4);
    expect(r.groups.zone[0]!.newShort).toBeCloseTo(2);
    expect(r.groups.zone[0]!.backLong).toBe(0);
  });

  it("spreads a zone's new stores over its cells by prospects and values them by type", () => {
    const r = computeMarket(base, settings({ newShort: [null, 0], newLong: [8, 0] }));
    // North: 30 liquor and 10 gas prospects take 6 and 2 of the 8.
    expect(r.groups.type[0]!.newLong).toBeCloseTo(6);
    expect(r.groups.type[1]!.newLong).toBeCloseTo(2);
    expect(r.groups.zone[0]!.revenueLong).toBeCloseTo(6 * 50_000 + 2 * 20_000);
    expect(r.groups.zone[0]!.profitLong).toBeCloseTo(6 * 5_000 + 2 * 4_000);
    expect(r.groups.zone[0]!.long).toBeCloseTo((10 + 8) / 54);
  });

  it("brings churned stores back with the business they had", () => {
    const r = computeMarket(base, settings({ backLong: [2, null] }));
    expect(r.groups.zone[0]!.backLong).toBeCloseTo(2);
    expect(r.total.revenueLong).toBeCloseTo(2 * 40_000 + 4 * 50_000 * (30 / 40) + 4 * 20_000 * (10 / 40) + 2 * 50_000);
  });

  it("uses the typical spend when asked, keeps long term at least short term and caps at the stores there are", () => {
    const r = computeMarket(base, settings({ spend: "typical", newShort: [0, 10], newLong: [0, 5], backLong: [99, null] }));
    expect(r.groups.zone[1]!.newLong).toBe(10);
    expect(r.groups.zone[1]!.revenueShort).toBeCloseTo(10 * 30_000);
    expect(r.groups.zone[0]!.backLong).toBe(4);
  });

  it("adds the Places scrape's new places as prospects when asked", () => {
    const withPlaces: MarketBase = { ...base, places_prospects: 20, cells: base.cells.map((c, i) => [...c.slice(0, 12), i === 0 ? 20 : 0] as unknown as MarketBase["cells"][number]) };
    expect(computeMarket(withPlaces, settings()).total.market).toBe(104);
    const r = computeMarket(withPlaces, settings({ withPlaces: true }));
    expect(r.total.market).toBe(124);
    expect(r.groups.zone[0]!.today).toBeCloseTo(10 / 74);
  });

  it("lets another dimension drive", () => {
    const r = computeMarket(base, settings({ driver: "type", newShort: [0, 0], newLong: [0, 5] }));
    expect(r.groups.zone[0]!.newLong).toBeCloseTo(5);
    expect(r.groups.zone[1]!.newLong).toBe(0);
  });
});
