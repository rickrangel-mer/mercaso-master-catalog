import { describe, expect, it } from "vitest";
import { computeWallet, DEFAULT_SETTINGS, gapFor, itemTarget, type WalletBase, type WalletSettings, type WalletStore } from "./wallet.ts";

const store = (extra: Partial<WalletStore>): WalletStore => ({
  type: "Liquor store",
  segment: 0,
  tierNow: 1,
  tierThen: 1,
  catalog: "liquor",
  lastNow: 5,
  lastThen: -1,
  ordersNow: 5,
  ordersThen: 0,
  spendNow: [0, 0, 0],
  spendThen: [0, 0, 0],
  catSpendNow: [0, 0, 0],
  catSpendThen: [0, 0, 0],
  skusNow: [0, 0, 0],
  skusThen: [0, 0, 0],
  itemsNow: [],
  itemsThen: [],
  ...extra,
});

// Two beverage items (must) and two candy items (should); "Other" has spend only.
const base: WalletBase = {
  schema_version: 1,
  as_of: "2026-10-22",
  then_as_of: "2025-10-22",
  groups: ["Beverage", "Candy & snacks", "Other"],
  tiers: ["1-5", "6-20", "21-50", "51+"],
  catalogs: {
    liquor: [
      { name: "Cola", group: 0, priority: "must", incrementality: 0.7 },
      { name: "Water", group: 0, priority: "must", incrementality: 0.7 },
      { name: "Chips", group: 1, priority: "should", incrementality: 1 },
      { name: "Candy", group: 1, priority: "should", incrementality: 1 },
    ],
  },
  segments: [{ key: "Liquor store|1", type: "Liquor store", tier: 1, catalog: "liquor", revenue: [100, 100, 50, 50], profit: [10, 10, 5, 5] }],
  stores: [
    // The best store carries everything.
    store({ ordersNow: 10, spendNow: [800, 200, 100], catSpendNow: [600, 50, 0], skusNow: [40, 20, 5], itemsNow: [0, 5, 1, 5, 2, 5, 3, 5], lastThen: 10, ordersThen: 2, spendThen: [100, 0, 0], itemsThen: [0, 5] }),
    store({ spendNow: [400, 0, 0], catSpendNow: [200, 0, 0], skusNow: [10, 0, 0], itemsNow: [0, 5, 2, 120] }), // chips bought too long ago
    store({ spendNow: [500, 0, 0], itemsNow: [0, 5, 1, 5], lastThen: 100 }),
    store({ lastNow: 60, spendNow: [999, 0, 0], itemsNow: [0, 5] }), // not active
    store({ type: "Gas station", segment: 0, spendNow: [50, 0, 0], itemsNow: [0, 5] }),
  ],
  margins: [0.1, 0.2, 0.3],
  realization: 1,
};
const settings = (extra: Partial<WalletSettings> = {}): WalletSettings => ({
  ...DEFAULT_SETTINGS,
  types: ["Liquor store"],
  reality: false,
  priorities: ["must", "should", "nice"],
  shortTerm: [null, null, null],
  longTerm: [null, null, null],
  ...extra,
});

describe("itemTarget and gapFor", () => {
  it("moves an item from today to the best stores, then on to 100%", () => {
    expect(itemTarget(0.2, 0.6, 0)).toBe(0.2);
    expect(itemTarget(0.2, 0.6, 0.5)).toBeCloseTo(0.4);
    expect(itemTarget(0.2, 0.6, 1)).toBeCloseTo(0.6);
    expect(itemTarget(0.2, 0.6, 1.5)).toBeCloseTo(0.8);
    expect(itemTarget(0.2, 0.6, 2)).toBe(1);
    expect(itemTarget(0.7, 0.6, 0.5)).toBe(0.7); // already above the best stores
  });

  it("finds the gap position for a target", () => {
    const at = (gap: number) => 0.3 + 0.2 * gap;
    expect(gapFor(0.4, at)).toBeCloseTo(0.5);
    expect(gapFor(0.2, at)).toBe(0); // below today
    expect(gapFor(0.9, at)).toBe(2); // above 100% of the reachable
  });
});

describe("computeWallet", () => {
  const r = computeWallet(base, settings());

  it("takes today's snapshot over active stores in view", () => {
    expect(r.today.stores).toBe(3);
    expect(r.today.orders).toBe(20);
    expect(r.today.aov).toEqual([85, 10, 5]);
    expect(r.today.penetration[0]).toBeCloseTo((1 + 2 / 3) / 2);
    expect(r.today.penetration[1]).toBeCloseTo((1 / 3 + 1 / 3) / 2);
    expect(Number.isNaN(r.today.penetration[2]!)).toBe(true);
    expect(r.today.revenue).toBeCloseTo(2000 * (365 / 90));
    expect(r.today.profit).toBeCloseTo((1700 * 0.1 + 200 * 0.2 + 100 * 0.3) * (365 / 90));
  });

  it("takes the snapshot 12 months ago the same way", () => {
    expect(r.then.stores).toBe(1);
    expect(r.then.aov[0]).toBe(50);
    expect(r.then.penetration[0]).toBe(0.5);
  });

  it("benchmarks against the best quarter of the segment", () => {
    expect(r.groups[0]!.best).toBe(1);
    expect(r.groups[1]!.best).toBe(1);
  });

  it("defaults to a third and two thirds of the gap, and values the new carriers", () => {
    const bev = r.groups[0]!;
    // Water: 2/3 today, 1 at the best store; a third of the gap is 1/9 → 1/3 of a store × $100.
    expect(bev.shortGap).toBeCloseTo(1 / 3);
    expect(bev.shortRevenue).toBeCloseTo(100 / 3);
    expect(bev.shortProfit).toBeCloseTo(10 / 3);
    expect(bev.longRevenue).toBeCloseTo(200 / 3);
    // Short-term AOV adds the extra yearly revenue over a year of orders.
    expect(r.shortTerm.aov[0]).toBeCloseTo(85 + (100 / 3 + 0) / (20 * (365 / 90)));
    expect(r.shortTerm.revenue).toBeCloseTo(r.today.revenue + bev.shortRevenue + r.groups[1]!.shortRevenue);
  });

  it("reaches a slider target by closing the same share of the gap", () => {
    const res = computeWallet(base, settings({ shortTerm: [null, 0.5, null] }));
    const candy = res.groups[1]!;
    // Candy: 1/3 today, 1 at the best store; 50% is a quarter of the gap.
    expect(candy.shortGap).toBeCloseTo(0.25);
    expect(candy.shortTerm).toBeCloseTo(0.5);
    // Each candy item gains a quarter of its 2/3 gap (1/6) across 3 stores = 0.5 of a store, at $50: 2 items × 0.5 × $50.
    expect(candy.shortRevenue).toBeCloseTo(2 * 0.5 * 50);
  });

  it("applies the back-test factors when the reality check is on", () => {
    const res = computeWallet(base, settings({ reality: true }));
    expect(res.groups[0]!.shortRevenue).toBeCloseTo((100 / 3) * 0.7);
  });

  it("measures catalog coverage and breadth without the catalog", () => {
    // Beverage: $800 of $1,700 on catalog SKUs; SKUs per store (40 + 10 + 0) / 3; best store 40.
    expect(r.today.coverage[0]).toBeCloseTo(800 / 1700);
    expect(r.today.coverage[1]).toBeCloseTo(50 / 200);
    expect(r.today.skus[0]).toBeCloseTo(50 / 3);
    expect(r.groups[0]!.skusToday).toBeCloseTo(50 / 3);
    expect(r.groups[0]!.skusBest).toBe(40);
  });

  it("keeps what stores already buy and adds the new items on top", () => {
    const year = 20 * (365 / 90);
    expect(r.shortTerm.aovAdded[0]).toBeCloseTo((100 / 3) / year);
    expect(r.shortTerm.aov[0]! - r.shortTerm.aovAdded[0]!).toBeCloseTo(r.today.aov[0]!);
    expect(r.today.aovAdded).toEqual([0, 0, 0]);
  });

  it("counts only the chosen priorities", () => {
    // Must only: beverage counts, candy (should) has no items, so no penetration.
    const res = computeWallet(base, settings({ priorities: ["must"] }));
    expect(res.today.penetration[0]).toBeCloseTo((1 + 2 / 3) / 2);
    expect(Number.isNaN(res.today.penetration[1]!)).toBe(true);
    expect(res.groups[1]!.shortRevenue).toBe(0);
  });

  it("filters by store type and changes with the active and item windows", () => {
    expect(computeWallet(base, settings({ types: [] })).today.stores).toBe(4);
    expect(computeWallet(base, settings({ activeDays: 90 })).today.stores).toBe(4);
    expect(computeWallet(base, settings({ itemDays: 180 })).today.penetration[1]).toBeCloseTo((2 / 3 + 1 / 3) / 2);
    expect(computeWallet(base, settings({ tiers: [2] })).today.stores).toBe(0);
  });
});
