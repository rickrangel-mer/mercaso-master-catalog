import { describe, expect, it } from "vitest";
import type { LeafInfo } from "../match/review-lib.ts";
import { bandFor, maxDiscount, memberDiscounts, stepDown, summarize, type MemberDiscountInput, type MemberStore, type SkuPrice } from "./lib.ts";

const leaf = (id: string, item: string, priority: string): LeafInfo => ({ id, department: "Drinks", item, priority, kind: "Branded", target: "", brandHints: "" });

describe("bands and the margin floor", () => {
  it("picks the lowest band that applies", () => {
    expect(bandFor(0)).toBe(2);
    expect(bandFor(0.0499)).toBe(2);
    expect(bandFor(0.05)).toBe(1);
    expect(bandFor(0.0999)).toBe(1);
    expect(bandFor(0.1)).toBe(0.5);
    expect(bandFor(0.1499)).toBe(0.5);
    expect(bandFor(0.15)).toBe(0);
  });

  it("allows at most price − cost ÷ 0.95, in whole cents", () => {
    // The brief's example: Coke 20oz 24-pack at $36.49 with a $34.28 cost has room for $0.40.
    expect(maxDiscount(36.49, 34.28)).toBe(0.4);
    expect(maxDiscount(20, 19)).toBe(0);
    expect(maxDiscount(10, 10)).toBeLessThan(0);
    // An existing member discount uses up room first.
    expect(maxDiscount(36.49, 34.28, 0.25)).toBe(0.15);
  });

  it("keeps a 5% margin at the allowed amount", () => {
    const price = 23.99;
    const cost = 19.96;
    const d = maxDiscount(price, cost);
    expect((price - d - cost) / (price - d)).toBeGreaterThanOrEqual(0.05);
    expect((price - d - 0.01 - cost) / (price - d - 0.01)).toBeLessThan(0.05);
  });

  it("steps down $2 → $1 → $0.50, and gives nothing when even $0.50 breaks the floor", () => {
    expect(stepDown(2, 3)).toBe(2);
    expect(stepDown(2, 1.5)).toBe(1);
    expect(stepDown(2, 0.72)).toBe(0.5);
    expect(stepDown(2, 0.5)).toBe(0.5);
    expect(stepDown(2, 0.49)).toBe(0);
    expect(stepDown(0.5, 5)).toBe(0.5);
    expect(stepDown(0, 5)).toBe(0);
  });
});

describe("memberDiscounts", () => {
  const leaves = [
    leaf("cola.20oz", "Cola › 20oz", "must"),
    leaf("cola.can", "Cola › Can", "must"),
    leaf("tea.az", "Tea › Arizona", "should"),
    leaf("juice", "Juice", "should"),
    leaf("snack", "Snack", "nice"),
    leaf("cig.pack", "Cigarettes › Pack", "must"),
    leaf("cig.carton", "Cigarettes › Carton", "should"),
    leaf("dead", "Dead item", "should"),
    leaf("thin", "Thin margin", "must"),
  ];
  const approved = [
    { node_id: "cola.20oz", sku: "C20", title: "Cola 20oz", case_pack: "24", share_12m: 0.5 },
    { node_id: "cola.can", sku: "CAN", title: "Cola can 24", case_pack: "24", share_12m: 0.1 },
    { node_id: "cola.can", sku: "CANNP", title: "Cola can 24 NON PRE-PRICED", case_pack: "24", share_12m: 0.05 },
    { node_id: "tea.az", sku: "AZ", title: "Arizona", case_pack: "24", share_12m: 0.3 },
    { node_id: "juice", sku: "J", title: "Juice", case_pack: "12", share_12m: 0.02 },
    { node_id: "snack", sku: "S", title: "Snack", case_pack: "12", share_12m: 0.01 },
    { node_id: "cig.pack", sku: "M", title: "Marlboro", case_pack: "10", share_12m: 0.1 },
    { node_id: "cig.carton", sku: "M", title: "Marlboro", case_pack: "10", share_12m: 0.1 },
    { node_id: "dead", sku: "D", title: "Dead", case_pack: "6", share_12m: 0 },
    { node_id: "thin", sku: "T", title: "Thin", case_pack: "6", share_12m: 0.01 },
  ];
  // 20 liquor members, 10 non-member liquor stores, 5 gas-station members.
  const stores: MemberStore[] = [
    ...Array.from({ length: 20 }, (_, i) => ({ store_id: `m${i}`, store_type: "Liquor store", member: true, last_order_date: "2026-10-01", orders_90d: 5 })),
    ...Array.from({ length: 10 }, (_, i) => ({ store_id: `n${i}`, store_type: "Liquor store", member: false, last_order_date: "2026-10-01", orders_90d: 5 })),
    { store_id: "idle", store_type: "Liquor store", member: false, last_order_date: "2026-01-01", orders_90d: 0 },
    ...Array.from({ length: 5 }, (_, i) => ({ store_id: `g${i}`, store_type: "Gas station", member: true, last_order_date: "2026-10-01", orders_90d: 5 })),
  ];
  const buy = (store: string, sku: string, cases = 2, last = "2026-09-20") => ({ store_id: store, sku, cases, last_order_date: last });
  const storeSkus = [
    // Cola 20oz: 10 of 20 members (50%) → no discount.
    ...Array.from({ length: 10 }, (_, i) => buy(`m${i}`, "C20")),
    // Cola can: one member buys the case pack, another its NON PRE-PRICED twin → 2 of 20 (10%) per item,
    // though each SKU alone is at 5%. A third member bought it before the window.
    buy("m0", "CAN"),
    buy("m1", "CANNP"),
    buy("m2", "CAN", 3, "2026-06-01"),
    buy("g0", "CAN", 4),
    // Arizona: 0 members, on supply hold.
    buy("n0", "AZ"),
    // Juice: no member, 3 non-members (30%) → no_member_buyers, $2 band.
    buy("n0", "J"),
    buy("n1", "J"),
    buy("n2", "J"),
    // Snack is nice: left out.
    buy("m0", "S"),
    // Marlboro: 1 member (5% → $1 band) on the pack item; the same SKU on the carton item.
    buy("m3", "M"),
    // Thin: one member (5% → $1 band), but the margin can't take even $0.50.
    buy("m4", "T"),
  ];
  const price = (p: number, cost: number | undefined, extra: Partial<SkuPrice> = {}): SkuPrice => ({
    price: p,
    promo: false,
    regular_price: p,
    ...(cost === undefined ? {} : { cost }),
    member_discount: 0,
    ...extra,
  });
  const prices = new Map<string, SkuPrice>([
    ["C20", price(36.49, 30)],
    ["CAN", price(16.99, 15.45)],
    ["CANNP", price(15.99, 12, { promo: true, regular_price: 17.99 })],
    ["AZ", price(20, 10)],
    ["J", price(24, 18, { member_discount: 0.25 })],
    ["S", price(10, 5)],
    ["M", price(114, 100)],
    ["D", price(10, 5)],
    ["T", price(10, 9.4)],
  ]);
  const input: MemberDiscountInput = {
    asOf: "2026-10-08",
    leaves,
    approved,
    stores,
    storeSkus,
    prices,
    holds: { tea: { reason: "Supply", since: "2026-09-30" } },
    storeType: "Liquor store",
    windowDays: 90,
    priorities: ["must", "should"],
  };
  const rows = memberDiscounts(input);
  const row = (sku: string) => rows.find((r) => r.sku === sku)!;

  it("measures penetration per catalog item over the store type's members, within the window", () => {
    expect(row("CAN").member_pen).toBe(0.1);
    expect(row("CANNP").member_pen).toBe(0.1);
    expect(row("CAN").member_buyers).toBe(2);
    expect(row("CAN").sku_member_pen).toBe(0.05);
    // All members: 3 of 25 (the gas-station member counts).
    expect(row("CAN").all_member_pen).toBe(0.12);
  });

  it("measures non-members among the store type's stores that ordered in the window", () => {
    expect(row("J").nonmember_pen).toBe(0.3);
    expect(row("J").nonmember_buyers).toBe(3);
  });

  it("applies the band to every approved SKU of the item, each against its own floor", () => {
    expect(row("C20").excluded).toBe("penetration_15pct_plus");
    expect(row("C20").discount).toBe(0);
    // Item at 10% → $0.50 band. CAN has $0.72 of room; the promo twin has more.
    expect(row("CAN")).toMatchObject({ band: 0.5, discount: 0.5, max_discount: 0.72, stepped_down: false });
    expect(row("CANNP")).toMatchObject({ band: 0.5, discount: 0.5, promo: true });
  });

  it("stacks on the promo price and any existing member discount", () => {
    // Juice: $24 − $0.25 existing − cost 18 ÷ 0.95 = 4.80 of room → full $2.
    const j = row("J");
    expect(j).toMatchObject({ band: 2, discount: 2, max_discount: 4.8, existing_member_discount: 0.25, no_member_buyers: true });
    expect(j.margin_after).toBeCloseTo((24 - 0.25 - 2 - 18) / (24 - 0.25 - 2), 4);
  });

  it("excludes supply holds, items no store bought, nice items and floor failures", () => {
    expect(row("AZ").excluded).toBe("supply_hold");
    expect(row("D").excluded).toBe("no_sales");
    expect(row("D").no_member_buyers).toBe(false);
    expect(rows.find((r) => r.sku === "S")).toBeUndefined();
    expect(row("T")).toMatchObject({ band: 1, excluded: "margin_floor", discount: 0 });
  });

  it("steps down when the band's discount breaks the floor", () => {
    const r = memberDiscounts({ ...input, prices: new Map([...prices, ["J", price(24, 21.5)]]) });
    expect(r.find((x) => x.sku === "J")).toMatchObject({ band: 2, max_discount: 1.36, discount: 1, stepped_down: true });
  });

  it("reports missing prices and costs", () => {
    const r = memberDiscounts({ ...input, prices: new Map([...prices, ["J", price(24, undefined)], ["CAN", price(0, 10)]]) });
    expect(r.find((x) => x.sku === "J")!.excluded).toBe("no_cost");
    expect(r.find((x) => x.sku === "CAN")!.excluded).toBe("no_price");
  });

  it("keeps one row per SKU, following the item more members buy", () => {
    const m = rows.filter((r) => r.sku === "M");
    expect(m).toHaveLength(1);
    expect(m[0]!.also_in).toHaveLength(1);
    expect(m[0]!.member_pen).toBe(0.05);
  });

  it("counts member cases in the window for the program's cost", () => {
    expect(row("CAN").member_cases).toBe(2);
    expect(row("CAN").all_member_cases).toBe(6);
    const s = summarize(rows, { members: 20, all_members: 25, nonmembers: 10 });
    expect(s.by_discount).toEqual({ "2": 1, "1": 1, "0.5": 2 });
    expect(s.by_discount_promo["0.5"]).toBe(1);
    expect(s.excluded).toMatchObject({ penetration_15pct_plus: 1, supply_hold: 1, no_sales: 1, margin_floor: 1 });
    expect(s.no_member_buyers).toBe(2); // juice, and Arizona (held)
    // CAN 0.5 × 6 + CANNP 0.5 × 2 + M 1 × 2 (all members); juice has no member cases.
    expect(s.cost_window_all_members).toBe(6);
  });
});
