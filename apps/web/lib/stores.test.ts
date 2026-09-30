import { describe, expect, it } from "vitest";
import type { ItemOut, StoreFile, StoreOut } from "./stores.ts";
import { bandOf, carried, peerMedians, storePivot, filterStores, gapsToCsv, groupStores, hasMoney, missingToCsv, sortStores, storeGaps, storeSummary, storesMissing, storesToCsv, tierDepartmentMedians } from "./stores.ts";

const item = (id: string, priority: "must" | "should" | "nice", adoption: number[], extra: Partial<ItemOut> = {}): ItemOut => ({
  id,
  item: id,
  department: "Soft drinks",
  category: "Cola",
  priority,
  type: "Branded",
  sku: `${id}-SKU`,
  title: `${id} product`,
  case_pack: "24",
  price: 20,
  promo: false,
  margin: 0.1,
  tiers: adoption.map((a) => ({ adoption: a, typical_cases: 10 })),
  adoption: 0.5,
  active_voids: 0,
  opportunity: 0,
  ...extra,
});
const store = (id: string, tier: number, must: number, extra: Partial<StoreOut> = {}): StoreOut => ({
  id,
  number: id,
  name: `Store ${id}`,
  organization: "",
  city: "Los Angeles",
  zip: "90001",
  status: "Active",
  days_since_order: 3,
  first_order: "2024-01-01",
  last_order: "2026-09-27",
  tier,
  orders_12m: 10 * (tier + 1),
  orders_90d: 3,
  orders_prev_90d: 3,
  trend: "flat",
  spend_12m: 1000,
  must,
  should: 0,
  nice: 0,
  score: 10,
  vs_peers: 0,
  departments: [must / 2],
  voids: { must: 2 - must, should: 1, nice: 0 },
  fading: 0,
  top_voids: [],
  opportunity: 100,
  bought: [],
  fading_items: [],
  last_bought: [],
  ...extra,
});
const file: StoreFile = {
  schema_version: 2,
  store_type: "liquor",
  as_of: "2026-09-30",
  active_days: 45,
  default_window_days: 90,
  window_days: 90,
  tiers: ["1-5", "6-20"],
  departments: ["Soft drinks"],
  totals: { must: 2, should: 1, nice: 0 },
  tier_median_must: [0, 0.5],
  items: [
    item("coke", "must", [0.2, 0.9]),
    item("pepsi", "must", [0.1, 0.4]),
    item("arizona", "should", [0.5, 0.95], { hold: { reason: "Stock", since: "2026-09-30" } }),
  ],
  stores: [
    store("A", 1, 2, { bought: [0, 1], name: "Kings Liquor", city: "Compton" }),
    store("B", 1, 1, { bought: [1], fading_items: [[0, 120]], trend: "down", fading: 1 }),
    store("C", 0, 0, { status: "Inactive", days_since_order: 80, organization: "Chain Co" }),
  ],
};

describe("store table", () => {
  it("filters by text, status, tier and trend", () => {
    const all = { query: "", status: "all" as const, tiers: [0, 1], trend: "all" as const };
    expect(filterStores(file, all).map((s) => s.id)).toEqual(["A", "B", "C"]);
    expect(filterStores(file, { ...all, query: "compton" }).map((s) => s.id)).toEqual(["A"]);
    expect(filterStores(file, { ...all, status: "Active" }).map((s) => s.id)).toEqual(["A", "B"]);
    expect(filterStores(file, { ...all, tiers: [0] }).map((s) => s.id)).toEqual(["C"]);
    expect(filterStores(file, { ...all, trend: "down" }).map((s) => s.id)).toEqual(["B"]);
  });

  it("sorts and groups with subtotals", () => {
    expect(sortStores(file, file.stores, "must", "desc").map((s) => s.id)).toEqual(["A", "B", "C"]);
    expect(groupStores(file, file.stores, "tier").map((g) => [g.label, g.stats.stores, g.stats.active, g.stats.medianMust])).toEqual([
      ["1–5 orders", 1, 0, 0],
      ["6–20 orders", 2, 2, 0.75],
    ]);
    expect(groupStores(file, file.stores, "band").map((g) => g.key)).toEqual(["0", "3", "4"]);
    expect(groupStores(file, file.stores, "organization")[0]?.label).toBe("(independent)");
    expect([0.05, 0.1, 0.3, 0.6, 0.8].map(bandOf)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("gaps", () => {
  it("lists a store's gaps: held items last, then by peer adoption, with fading marked", () => {
    const gaps = storeGaps(file, file.stores[1]!);
    expect(gaps.map((g) => [g.item.id, g.fadingDays, g.hold, g.expected])).toEqual([
      ["coke", 120, false, 0.9 * 10 * 20],
      ["arizona", undefined, true, 0],
    ]);
    expect(gapsToCsv(file, file.stores[1]!, gaps).split("\n")[1]).toBe("Store B,Soft drinks,coke,must,fading,120,coke-SKU,coke product,24,90.0,10,20.00,no,10.0,180,");
  });

  it("finds the active stores missing an item, most likely buyers first", () => {
    expect(storesMissing(file, 0).map((s) => s.id)).toEqual(["B"]);
    // Arizona: both active stores lack it; same tier and orders, so file order holds.
    expect(storesMissing(file, 2).map((s) => s.id)).toEqual(["A", "B"]);
    expect(missingToCsv(file, 0, storesMissing(file, 0)).split("\n")[1]).toBe("coke,coke-SKU,Store B,B,Los Angeles,90001,6-20,20,90.0,fading");
  });
});

describe("pivot", () => {
  it("rolls a store up by department and category, with peers, gaps and fading", () => {
    const medians = peerMedians(file);
    // A carries coke and pepsi (2 of 3), B carries pepsi (1 of 3): median 1/2.
    expect(medians[1]?.get("Soft drinks")).toBeCloseTo(0.5);
    const b = file.stores[1]!;
    expect([...carried(b)]).toEqual([1]);
    const [dept] = storePivot(file, b, medians);
    // Coke is fading (bought 120 days ago), so it is a gap, not carried.
    expect(dept).toMatchObject({ key: "Soft drinks", items: 3, bought: 1, mustGaps: 1, gaps: 1, fading: 1, expected: 180 });
    expect(dept!.children.map((c) => [c.key, c.label, c.items])).toEqual([["Soft drinks|Cola", "Cola", 3]]);
    // Gaps first, then fading, then held, then bought.
    expect(dept!.children[0]!.leaves.map((l) => [l.item.id, l.state, l.days])).toEqual([
      ["coke", "fading", 120],
      ["arizona", "hold", undefined],
      ["pepsi", "bought", undefined],
    ]);
  });
});

describe("summary and export", () => {
  it("summarizes the base", () => {
    const s = storeSummary(file);
    expect([s.stores, s.active, s.inactive, s.under10, s.decliningActive, s.inactiveMedianDays]).toEqual([3, 2, 1, 1, 1, 80]);
    expect(s.bands.map((b) => b.active + b.inactive)).toEqual([1, 0, 0, 1, 1]);
    expect(tierDepartmentMedians(file)).toEqual([[0], [0.75]]);
  });

  it("writes CSV with money columns only when the build has prices", () => {
    expect(hasMoney(file)).toBe(true);
    expect(storesToCsv(file, file.stores).split("\n")[0]).toContain("est_opportunity_yr");
    const plain = { ...file, items: file.items.map(({ price: _p, ...rest }) => rest) };
    expect(storesToCsv(plain, plain.stores).split("\n")[0]).not.toContain("spend_12m");
  });
});
