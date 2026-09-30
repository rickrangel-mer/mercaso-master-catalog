import { describe, expect, it } from "vitest";
import type { LeafInfo } from "../match/review-lib.ts";
import { median, scoreStores, tierOf, trendOf, withoutContact, type StoreInput } from "./lib.ts";

const leaf = (id: string, department: string, item: string, priority: string, kind: "Branded" | "Slot" = "Branded"): LeafInfo => ({
  id,
  department,
  item,
  priority,
  kind,
  target: "",
  brandHints: "",
});
const leaves = [
  leaf("scd.coke.20oz", "Soft drinks", "Cola › Coca-Cola › 20oz", "must"),
  leaf("scd.coke.2l", "Soft drinks", "Cola › Coca-Cola › 2L", "should"),
  leaf("tob.marlboro.pack", "Tobacco", "Cigarettes › Marlboro › Pack", "must"),
  leaf("tob.marlboro.carton", "Tobacco", "Cigarettes › Marlboro › Carton", "should"),
  leaf("hb.condoms", "Health & beauty", "Condoms", "nice", "Slot"),
  leaf("gro.no-sku", "Grocery", "Something Mercaso lacks", "must", "Slot"),
];
const approved = [
  { node_id: "scd.coke.20oz", sku: "C20", title: "Coca-Cola 20 oz", case_pack: "24", share_12m: 0.68 },
  { node_id: "scd.coke.20oz", sku: "C20B", title: "Coca-Cola 20 oz big case", case_pack: "192", share_12m: 0.05 },
  { node_id: "scd.coke.2l", sku: "C2L", title: "Coca-Cola 2L", case_pack: "8", share_12m: 0.6 },
  { node_id: "tob.marlboro.pack", sku: "M", title: "Marlboro", case_pack: "10", share_12m: 0.1 },
  { node_id: "tob.marlboro.carton", sku: "M", title: "Marlboro", case_pack: "10", share_12m: 0.1 },
  { node_id: "hb.condoms", sku: "T", title: "Trojan", case_pack: "6", share_12m: 0.17 },
];
const store = (id: string, orders: number, last: string, extra: Partial<StoreInput> = {}): StoreInput => ({
  store_id: id,
  store_number: id,
  store_name: `Store ${id}`,
  organization_name: "",
  city: "LA",
  postal_code: "90001",
  first_order_date: "2024-01-01",
  last_order_date: last,
  orders_12m: orders,
  orders_90d: 3,
  orders_prev_90d: 3,
  spend_12m: 1000,
  ...extra,
});
const asOf = "2026-09-30";
const stores = [store("A", 30, "2026-09-25"), store("B", 25, "2026-07-01", { orders_90d: 0, orders_prev_90d: 4 }), store("C", 2, "2026-09-29")];
const storeSkus = [
  // A buys Coke 20oz (via the small SKU) and 2L recently, and Trojan long ago.
  { store_id: "A", sku: "C20B", cases: 10, last_order_date: "2026-09-20" },
  { store_id: "A", sku: "C2L", cases: 40, last_order_date: "2026-09-20" },
  { store_id: "A", sku: "T", cases: 2, last_order_date: "2026-03-01" },
  // B buys Coke 20oz only.
  { store_id: "B", sku: "C20", cases: 20, last_order_date: "2026-06-30" },
  { store_id: "Z", sku: "C20", cases: 99, last_order_date: "2026-09-01" },
];
const prices = new Map([
  ["C20", { price: 36.49, promo: true, margin: 0.06 }],
  ["C2L", { price: 19.99, promo: false }],
  ["M", { price: 100, promo: false }],
]);
const file = scoreStores({ asOf, storeType: "liquor", leaves, approved, stores, storeSkus, prices });
const byId = (id: string) => file.stores.find((s) => s.id === id)!;

describe("supply holds", () => {
  const held = scoreStores({ asOf, storeType: "liquor", leaves, approved, stores, storeSkus, prices, holds: { "scd.coke": { reason: "Stock issue", since: "2026-09-30" } } });
  it("keep held items in coverage but out of fading, voids, top voids and opportunity", () => {
    const b = held.stores.find((s) => s.id === "B")!;
    // B bought Coke 20oz 92 days ago: still covered, but not fading, not a void, not in the opportunity.
    expect([b.must, b.fading, b.fading_items.length]).toEqual([1, 0, 1]);
    expect(b.voids).toEqual({ must: 1, should: 1, nice: 1 });
    expect(b.top_voids).toEqual([2]);
    expect(b.opportunity).toBe(0);
    expect(held.items[0]?.hold).toEqual({ reason: "Stock issue", since: "2026-09-30" });
    expect(held.items[2]?.hold).toBeUndefined();
    // Still counted as a void at active stores for the item view, with no opportunity.
    expect(held.items[1]).toMatchObject({ active_voids: 1, opportunity: 0 });
  });
});

describe("contact details", () => {
  it("removes emails from store and organization names", () => {
    expect(withoutContact("masna.hanna@yahoo.com")).toBe("");
    expect(withoutContact("Kings Liquor (kings.liquor+1@gmail.com)")).toBe("Kings Liquor");
    expect(withoutContact("Happys Liquor")).toBe("Happys Liquor");
    const f = scoreStores({ asOf, storeType: "liquor", leaves, approved, stores: [store("E", 3, "2026-09-29", { organization_name: "a.b@c.com", store_name: "Shop - owner@x.org" })], storeSkus: [], prices: null });
    expect([f.stores[0]?.name, f.stores[0]?.organization]).toEqual(["Shop", ""]);
  });
});

describe("helpers", () => {
  it("tiers, trends and medians", () => {
    expect([1, 5, 6, 20, 21, 50, 51, 400].map(tierOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    // ±20% or more is a change; exactly 20% counts.
    expect([trendOf(0, 0), trendOf(3, 0), trendOf(6, 5), trendOf(4, 5), trendOf(11, 10)]).toEqual(["none", "new", "up", "down", "flat"]);
    expect([trendOf(7, 5), trendOf(3, 5)]).toEqual(["up", "down"]);
    expect([median([]), median([3, 1, 2]), median([4, 1, 2, 3])]).toEqual([0, 2, 2.5]);
  });
});

describe("scoreStores", () => {
  it("scores only items Mercaso can supply, and recommends the best-selling SKU", () => {
    expect(file.items.map((i) => i.id)).not.toContain("gro.no-sku");
    expect(file.totals).toEqual({ must: 2, should: 2, nice: 1 });
    expect(file.items[0]).toMatchObject({ sku: "C20", price: 36.49, promo: true, margin: 0.06, category: "Cola" });
  });

  it("measures coverage over 12 months, and splits recent buys from fading ones", () => {
    const a = byId("A");
    expect([a.must, a.should, a.nice]).toEqual([1, 1, 1]);
    expect(a.bought).toEqual([0, 1]);
    expect(a.fading_items).toEqual([[4, 213]]);
    expect(a.voids).toEqual({ must: 1, should: 1, nice: 1 });
    // (3 × 1/2 + 2 × 1/2 + 1 × 1) / 6
    expect(a.score).toBe(58.3);
    expect(file.departments).toEqual(["Soft drinks", "Tobacco", "Health & beauty"]);
    expect(a.departments).toEqual([1, 0, 1]);
    expect(a.status).toBe("Active");
  });

  it("marks a store inactive after 45 days without an order, and reads the trend", () => {
    const b = byId("B");
    expect([b.status, b.days_since_order, b.trend]).toEqual(["Inactive", 91, "down"]);
    // B bought Coke 20oz 92 days ago: counted as bought in 12 months, but fading.
    expect([b.must, b.fading, b.bought]).toEqual([1, 1, []]);
  });

  it("compares stores with their tier, and prices voids by peer adoption and volume", () => {
    // A and B are both in the 21-50 tier, each with half the must items: tier median 50%.
    expect(file.tier_median_must[2]).toBe(0.5);
    expect([byId("A").vs_peers, byId("B").vs_peers]).toEqual([0, 0]);
    const coke20 = file.items[0]!;
    expect(coke20.tiers[2]).toEqual({ adoption: 1, typical_cases: 15 });
    // B's voids: Coke 20oz (fading, 100% of peers, 15 cases × $36.49) and 2L (50%, 40 × $19.99);
    // Marlboro pack and carton share SKU M and nobody buys it, so they add nothing.
    expect(byId("B").opportunity).toBe(Math.round(15 * 36.49 + 0.5 * 40 * 19.99));
    expect(byId("B").top_voids[0]).toBe(0);
  });

  it("sums voids and expected revenue per item across active stores only", () => {
    // Coke 2L: void at C (active, tier 1-5 where nobody buys it) and B (inactive): one active void.
    const coke2l = file.items[1]!;
    expect([coke2l.active_voids, coke2l.opportunity]).toEqual([1, 0]);
  });
});
