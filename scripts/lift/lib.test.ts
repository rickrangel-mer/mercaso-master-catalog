import { describe, expect, it } from "vitest";
import type { LeafInfo } from "../match/review-lib.ts";
import { backtestRows, buildModel, expected, incrementalityOf, liftRows, range, realizationHigh, realizationOf, storeLift, target, type LiftInput, type Store } from "./lib.ts";

const leaf = (id: string, department: string, priority: string): LeafInfo => ({ id, department, item: id, priority, kind: "Branded", target: "", brandHints: "" });
const store = (i: number, extra: Partial<Store> = {}): Store => ({
  id: `s${i}`,
  type: "Gas station",
  number: String(i),
  name: `Store ${i}`,
  city: "LA",
  last_order_date: "2026-10-15",
  orders_12m: 10,
  ...extra,
});
const buy = (s: number, sku: string, cases: number, last = "2026-10-01") => ({ store_id: `s${s}`, sku, cases, last_order_date: last });

// Eight active gas stations (one pooled group, under MIN_GROUP), an inactive one and a restaurant.
const input: LiftInput = {
  asOf: "2026-10-21",
  catalogs: [
    {
      key: "liquor",
      leaves: [leaf("scd.soda", "Soft drinks", "must"), leaf("snacks.chips", "Snacks", "should"), leaf("drinks.tea", "Drinks", "nice"), leaf("drinks.none", "Drinks", "nice")],
      approved: [
        { node_id: "scd.soda", sku: "S1", case_pack: 24, share_12m: 0.5 },
        { node_id: "scd.soda", sku: "S2", case_pack: 12, share_12m: 0.1 },
        { node_id: "snacks.chips", sku: "C1", case_pack: 10, share_12m: 0.2 },
        { node_id: "drinks.tea", sku: "T1", case_pack: 24, share_12m: 0.3 },
      ],
      holds: { "drinks.tea": { reason: "Supply", since: "2026-09-30" } },
    },
  ],
  typeCatalog: { "Gas station": "liquor", "": "liquor" },
  stores: [
    ...Array.from({ length: 8 }, (_, i) => store(i)),
    store(8, { last_order_date: "2026-08-01" }),
    store(9, { type: "Restaurant" }),
  ],
  storeSkus: [
    buy(0, "S1", 4), // 96 units
    buy(1, "S2", 8), // 96 units through the 12-pack twin
    buy(2, "S1", 4),
    buy(3, "S1", 2), // 48 units
    buy(0, "C1", 5), // 50 units
    buy(1, "C1", 3), // 30 units
    buy(4, "C1", 2, "2026-05-01"), // 20 units, outside the 90-day window
    buy(5, "T1", 1),
    buy(8, "S1", 50), // inactive
    buy(9, "S1", 50), // not covered
  ],
  prices: new Map([
    ["S1", { price: 24, cost: 18 }], // $1.00 a unit, $0.25 margin
    ["C1", { price: 20, cost: 15 }], // $2.00 a unit, $0.50 margin
    ["T1", { price: 24, cost: 12 }],
  ]),
};
const model = buildModel(input);
const g = model.groups[0]!;
const at = (id: string) => g.items[model.catalogs.get("liquor")!.findIndex((it) => it.id === id)]!;

describe("buildModel", () => {
  it("keeps covered active stores in peer groups, pooling a small tier", () => {
    expect(model.groups).toHaveLength(1);
    expect(g.key).toBe("Gas station|all");
    expect(g.stores).toHaveLength(8);
  });

  it("measures penetration per item in the window, counting twin SKUs once", () => {
    expect(at("scd.soda").penetration).toBe(0.5);
    expect(at("snacks.chips").penetration).toBe(0.25);
  });

  it("takes typical volume in units from the 12-month buyers", () => {
    expect(at("scd.soda").typical).toBe(96);
    expect(at("snacks.chips").typical).toBe(30);
  });

  it("finds the best-assorted quarter's penetration", () => {
    expect(at("scd.soda").top).toBe(1);
    expect(at("snacks.chips").top).toBe(1);
  });

  it("drops items with no approved SKU", () => {
    expect(model.catalogs.get("liquor")!.map((i) => i.id)).not.toContain("drinks.none");
  });
});

describe("scenarios", () => {
  it("sets targets", () => {
    expect(target("catch_up", { penetration: 0.2, top: 0.6 })).toBe(0.6);
    expect(target("catch_up", { penetration: 0.7, top: 0.6 })).toBe(0.7);
    expect(target("plus_5", { penetration: 0.2, top: 0 })).toBeCloseTo(0.25);
    expect(target("plus_10", { penetration: 0.95, top: 1 })).toBe(1);
    expect(target("plus_10", { penetration: 0, top: 0.5 })).toBe(0);
  });

  it("values extra stores at typical units × unit price, leaving held items out", () => {
    const rows = liftRows(model, "catch_up");
    const soda = rows.find((r) => model.catalogs.get("liquor")![r.item]!.id === "scd.soda")!;
    const chips = rows.find((r) => model.catalogs.get("liquor")![r.item]!.id === "snacks.chips")!;
    const tea = rows.find((r) => model.catalogs.get("liquor")![r.item]!.id === "drinks.tea")!;
    expect(soda).toMatchObject({ stores: 8, buyers: 4, extra: 4, revenue: 384, margin: 96 });
    expect(chips).toMatchObject({ extra: 6, revenue: 360, margin: 90 });
    expect(tea.revenue).toBe(0);
    const plus5 = liftRows(model, "plus_5").find((r) => r.item === soda.item)!;
    expect(plus5.revenue).toBeCloseTo(38.4);
  });

  it("splits the lift over the gap stores without losing any", () => {
    const stores = storeLift(model, "catch_up");
    const total = liftRows(model, "catch_up").reduce((a, r) => a + r.revenue, 0);
    expect(stores.reduce((a, s) => a + s.revenue, 0)).toBeCloseTo(total);
    const s7 = stores.find((s) => model.stores[s.store]!.id === "s7")!;
    expect(s7.revenue).toBeCloseTo(96 + 60);
    expect(s7.gaps[0]![1]).toBe(96);
  });
});

describe("back-test", () => {
  const adopters = [
    { store_id: "s4", item: "scd.soda", item_after: 120 }, // 120 in its first year against 96
    { store_id: "s5", item: "snacks.chips", item_after: 30 }, // 30 against 30
    { store_id: "s6", item: "scd.soda", item_after: 48 }, // 48 against 96
    { store_id: "s9", item: "scd.soda", item_after: 99 }, // a restaurant: not covered
  ];
  const rows = backtestRows(model, input.typeCatalog, adopters);

  it("compares adopters' first year with the typical volume", () => {
    expect(rows.map((r) => [r.actual, r.predicted])).toEqual([
      [120, 96],
      [30, 30],
      [48, 96],
    ]);
    expect(realizationOf(rows)).toBe(1); // median of 1.25, 1 and 0.5
    expect(realizationOf([])).toBe(1);
  });

  it("measures substitution across stores: extra units per extra item over units per item", () => {
    // 60 stores: half carry one drink (100 units), half carry two (150 units). Their other
    // category varies the same way in both halves, so it does not explain the difference.
    const synth: LiftInput = {
      asOf: "2026-10-21",
      catalogs: [
        {
          key: "liquor",
          leaves: [leaf("drinks.x.a", "Drinks", "must"), leaf("drinks.x.b", "Drinks", "must"), leaf("snacks.c.c", "Snacks", "must")],
          approved: [
            { node_id: "drinks.x.a", sku: "A", case_pack: 1, share_12m: 0 },
            { node_id: "drinks.x.b", sku: "B", case_pack: 1, share_12m: 0 },
            { node_id: "snacks.c.c", sku: "C", case_pack: 1, share_12m: 0 },
          ],
        },
      ],
      typeCatalog: { "Gas station": "liquor" },
      stores: Array.from({ length: 60 }, (_, i) => store(i)),
      storeSkus: Array.from({ length: 60 }, (_, i) =>
        i < 30 ? [buy(i, "A", 100), buy(i, "C", 50 + (i % 5) * 10)] : [buy(i, "A", 75), buy(i, "B", 75), buy(i, "C", 50 + (i % 5) * 10)],
      ).flat(),
      prices: new Map(),
    };
    const inc = incrementalityOf(buildModel(synth));
    // Slope 50 units per item, against 7,500 / 90 = 83.3 units per item.
    expect(inc.raw.get("Drinks")).toBeCloseTo(0.6);
    expect(inc.byDept.get("Drinks")).toBeCloseTo(0.6);
    // Every store carries one snack, so snacks have no estimate and use the overall figure.
    expect(inc.raw.has("Snacks")).toBe(false);
    expect(inc.overall).toBeCloseTo(0.6);
  });

  it("scales gross lift and brackets it low and high", () => {
    const inc = { byDept: new Map([["Soft drinks", 0.9]]), overall: 1, raw: new Map() };
    const gross = [
      { department: "Soft drinks", value: 1000 },
      { department: "Snacks", value: 100 },
    ];
    expect(expected(gross, 1.5, inc)).toBeCloseTo(1000 * 1.5 * 0.9 + 100 * 1.5);
    // Ratios 1.25, 1 and 0.5: median 1; mean with the cap at 2: 2.75 / 3.
    expect(realizationHigh(rows)).toBeCloseTo(2.75 / 3);
    expect(realizationHigh([{ department: "x", actual: 10, predicted: 1 }])).toBe(2);
    const [lo, hi] = range(gross, rows, inc);
    expect(lo).toBeCloseTo(1000 * 0.7 + 100 * 0.7);
    expect(hi).toBeCloseTo((2.75 / 3) * (1000 * 0.9 + 100));
  });
});
