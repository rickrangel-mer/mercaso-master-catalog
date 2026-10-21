import { describe, expect, it } from "vitest";
import { activeYear, cappedMean, churnedYear, marginRate, plan, prospectType, statusOf, typeProfiles, type GrowthStore } from "./lib.ts";

const asOf = "2026-10-21";
const store = (id: string, extra: Partial<GrowthStore>): GrowthStore => ({
  id,
  type: "Liquor store",
  first_order_date: "2024-01-01",
  last_order_date: "2026-10-15",
  spend_12m: 10_000,
  orders_12m: 10,
  spend_before: 10_000,
  orders_before: 10,
  ...extra,
});

describe("stores", () => {
  it("sorts stores into active, churned and lapsed", () => {
    expect(statusOf(store("a", { last_order_date: "2026-09-10" }), asOf)).toBe("active"); // 41 days
    expect(statusOf(store("b", { last_order_date: "2026-08-01" }), asOf)).toBe("churned");
    expect(statusOf(store("c", { last_order_date: "2025-06-01" }), asOf)).toBe("lapsed");
  });

  it("annualizes young stores, at least as if 90 days old", () => {
    expect(activeYear(store("a", {}), asOf)).toEqual({ spend: 10_000, orders: 10 });
    // 182 days old: doubled.
    const half = activeYear(store("b", { first_order_date: "2026-04-23", spend_12m: 5_000, orders_12m: 6 }), asOf);
    expect(half.spend).toBeCloseTo(10_000, -2);
    // 11 days old: counted as 90 days, not 11.
    expect(activeYear(store("c", { first_order_date: "2026-10-11", spend_12m: 900, orders_12m: 1 }), asOf).spend).toBeCloseTo(3_650);
  });

  it("values a churned store at its last year before it stopped", () => {
    expect(churnedYear(store("a", { first_order_date: "2023-01-01", last_order_date: "2026-05-01", spend_before: 24_000 }))).toBe(24_000);
    // A customer for 180 days before stopping: annualized.
    expect(churnedYear(store("b", { first_order_date: "2025-11-03", last_order_date: "2026-05-01", spend_before: 6_000 }))).toBeCloseTo((6_000 * 365) / 180);
  });

  it("caps the top 5% for the average", () => {
    const xs = [...Array.from({ length: 19 }, () => 100), 10_000];
    expect(cappedMean(xs)).toBe(100 * 19 / 20 + 10_000 / 20); // 95th percentile is the giant itself with 20 values
    const ys = [...Array.from({ length: 99 }, () => 100), 1_000_000];
    expect(cappedMean(ys)).toBe(100);
  });
});

describe("new stores follow today's tier mix", () => {
  // Liquor: 6 stores ordering 1–5 times a year ($2K) and 6 ordering 21–50 times ($20K).
  const stores = [
    ...Array.from({ length: 6 }, (_, i) => store(`l${i}`, { orders_12m: 3, spend_12m: 2_000 })),
    ...Array.from({ length: 6 }, (_, i) => store(`h${i}`, { orders_12m: 30, spend_12m: 20_000 })),
    // Laundromats: 2 stores in tier 1–5, too few for their own spend, so all types' tier figure.
    store("w1", { type: "Laundromat", orders_12m: 2, spend_12m: 500 }),
    store("w2", { type: "Laundromat", orders_12m: 4, spend_12m: 700 }),
    store("old", { last_order_date: "2026-01-01", spend_12m: 99_999 }), // not active
  ];
  const profiles = typeProfiles(stores, asOf);

  it("keeps each type's share of stores per tier", () => {
    const liquor = profiles.get("Liquor store")!;
    expect(liquor.stores).toBe(12);
    expect(liquor.tierShare).toEqual([0.5, 0, 0.5, 0]);
    expect(liquor.newStore.low).toBe(0.5 * 2_000 + 0.5 * 20_000);
  });

  it("borrows all types' tier spend where a type has too few stores", () => {
    const w = profiles.get("Laundromat")!;
    expect(w.tierShare[0]).toBe(1);
    // Tier 1–5 across types: six $2K liquor stores and $500, $700 laundromats; median $2K.
    expect(w.newStore.low).toBe(2_000);
  });
});

describe("targets", () => {
  it("adds stores from prospects and churned stores in proportion, valued by type and history", () => {
    const profiles = typeProfiles(
      [
        ...Array.from({ length: 10 }, (_, i) => store(`l${i}`, { orders_12m: 30, spend_12m: 20_000 })),
        ...Array.from({ length: 10 }, (_, i) => store(`g${i}`, { type: "Gas station", orders_12m: 30, spend_12m: 30_000 })),
      ],
      asOf,
    );
    const result = plan(
      {
        active: 20,
        // 50 liquor, 30 gas and 20 unclear prospects (unclear follow the 5:3 mix).
        prospects: new Map([
          ["Liquor store", 50],
          ["Gas station", 30],
          ["", 20],
        ]),
        churned: Array.from({ length: 20 }, () => 12_000),
        profiles,
        margin: new Map([["Liquor store", 0.1]]),
        marginOverall: 0.2,
      },
      [0.1, 0.25],
    );
    expect(result.market).toBe(140);
    expect(result.today).toBeCloseTo(20 / 140);
    expect(result.targets[0]!.needed).toBe(0); // already above 10%
    const t = result.targets[1]!;
    expect(t.needed).toBe(15); // 25% of 140 = 35 active
    expect(t.winBacks).toBe(Math.round((15 * 20) / 120)); // 3
    expect(t.newStores).toBe(12);
    const liquor = t.byType.find((x) => x.type === "Liquor store")!;
    const gas = t.byType.find((x) => x.type === "Gas station")!;
    expect(liquor.stores).toBeCloseTo(12 * 5 / 8);
    expect(liquor.sales.expected).toBeCloseTo(7.5 * 20_000);
    expect(liquor.profit.expected).toBeCloseTo(7.5 * 20_000 * 0.1);
    expect(gas.profit.expected).toBeCloseTo(4.5 * 30_000 * 0.2); // no own margin: overall
    expect(t.winBackSales.expected).toBe(3 * 12_000);
    expect(t.sales.expected).toBeCloseTo(7.5 * 20_000 + 4.5 * 30_000 + 36_000);
  });
});

describe("prospect names and margin", () => {
  it("reads a store type from the name", () => {
    expect(prospectType("Chevron #123")).toBe("Gas station");
    expect(prospectType("76")).toBe("Gas station");
    expect(prospectType("7-Eleven")).toBe("Convenience store");
    expect(prospectType("5 Points Liquor #2")).toBe("Liquor store");
    expect(prospectType("Super Wash Laundromat")).toBe("Laundromat");
    expect(prospectType("La Mexicana Market")).toBe("Market / grocery");
    expect(prospectType("Cloud 9 Smoke Shop")).toBe("Smoke shop");
    expect(prospectType("Joe's")).toBe("");
  });

  it("measures gross margin over SKUs with a price and cost", () => {
    expect(marginRate([{ cases: 2, price: 10, cost: 8 }, { cases: 1, price: 20, cost: 15 }, { cases: 5, price: 10 }])).toBeCloseTo((4 + 5) / 40);
    expect(marginRate([])).toBeUndefined();
  });
});
