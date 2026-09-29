import { describe, expect, it } from "vitest";
import type { OutputNode, StoreTypeCatalog } from "./tree.ts";
import { indexCatalog } from "./tree.ts";
import { approvedSkuCount, coverageByDepartment, filterRows, groupRows, mustGaps, rowsToCsv, skuRows, sortRows, withPrices } from "./table.ts";

const gap = { status: "gap" as const, approved: 0, pending: 0, rejected: 0, skus: [] };
const sku = (id: string, title: string, share: number, status: "approved" | "auto" = "approved") => ({
  sku: id,
  title,
  status,
  source: "rule" as const,
  case_pack: 24,
  share_12m: share,
  share_90d: share / 2,
});

const leaf = (id: string, name: string, kind: "size" | "assortment_slot", priority: "must" | "should" | "nice", match: OutputNode["match"] = gap): OutputNode => ({
  id,
  key: id.split(".").pop()!,
  name,
  kind,
  priority,
  attrs: {},
  match,
});

const catalog: StoreTypeCatalog = {
  schema_version: 1,
  store_type: "liquor",
  name: "Liquor store",
  summary: {
    leaves: 3,
    by_kind: { size: 2, assortment_slot: 1 },
    by_priority: { must: 2, should: 0, nice: 1 },
    match: { matched: 1, covered: 1, partial: 0, gap: 1 },
    verify: { sales: 0, stock: 0 },
    dropped_restricted: [],
  },
  departments: [
    {
      id: "scd",
      key: "scd",
      name: "Soft drinks",
      kind: "department",
      attrs: {},
      children: [
        {
          id: "scd.cola",
          key: "cola",
          name: "Cola",
          kind: "category",
          attrs: {},
          children: [
            {
              id: "scd.cola.coke",
              key: "coke",
              name: "Coca-Cola",
              kind: "brand_line",
              attrs: {},
              children: [
                {
                  id: "scd.cola.coke.classic",
                  key: "classic",
                  name: "Classic",
                  kind: "variant",
                  attrs: {},
                  children: [
                    leaf("scd.cola.coke.classic.20oz", "20oz bottle", "size", "must", {
                      status: "matched",
                      approved: 2,
                      pending: 0,
                      rejected: 0,
                      skus: [sku("A", "Coca-Cola 20 oz (24 Pack)", 0.68), sku("B", "Coca-Cola 20 oz (192 Pack)", 0.05)],
                    }),
                  ],
                },
              ],
            },
            leaf("scd.cola.rc", "RC Cola", "size", "nice"),
          ],
        },
      ],
    },
    {
      id: "household",
      key: "household",
      name: "Household",
      kind: "department",
      attrs: {},
      children: [
        {
          id: "household.cleaning",
          key: "cleaning",
          name: "Cleaning",
          kind: "category",
          attrs: {},
          children: [
            leaf("household.cleaning.bleach", "Bleach", "assortment_slot", "must", {
              status: "covered",
              approved: 1,
              pending: 1,
              rejected: 0,
              skus: [sku("C", "Clorox Bleach 11 oz", 0.18), sku("D", "Cloralen 16.9 oz", 0.13, "auto")],
            }),
          ],
        },
      ],
    },
  ],
};

const index = indexCatalog(catalog);
const rows = skuRows(index);

describe("skuRows", () => {
  it("gives one row per SKU with the catalog context, and one row per item with no SKU", () => {
    expect(rows.map((r) => [r.sku ?? "-", r.department, r.category, r.item, r.type])).toEqual([
      ["A", "Soft drinks", "Cola", "Coca-Cola › Classic › 20oz bottle", "Branded"],
      ["B", "Soft drinks", "Cola", "Coca-Cola › Classic › 20oz bottle", "Branded"],
      ["-", "Soft drinks", "Cola", "RC Cola", "Branded"],
      ["C", "Household", "Cleaning", "Bleach", "Slot"],
      ["D", "Household", "Cleaning", "Bleach", "Slot"],
    ]);
    expect(rows[3]?.status).toBe("approved");
    expect(rows[4]?.status).toBe("proposed");
    expect(approvedSkuCount(rows)).toBe(3);
  });
});

describe("grouping and filtering", () => {
  it("subtotals each group by items, SKUs, gaps and priority", () => {
    const groups = groupRows(rows, "department");
    expect(groups.map((g) => [g.label, g.stats.items, g.stats.skus, g.stats.gaps, g.stats.must, g.stats.nice, g.stats.topShare])).toEqual([
      ["Soft drinks", 2, 2, 1, 1, 1, 0.68],
      ["Household", 1, 2, 0, 1, 0, 0.18],
    ]);
    expect(groupRows(rows, "priority").map((g) => g.key)).toEqual(["must", "nice"]);
  });

  it("filters by priority, status, gaps and text", () => {
    const base = { query: "", priorities: ["must", "should", "nice"] as ("must" | "should" | "nice")[], status: "all" as const, includeGaps: false };
    expect(filterRows(rows, base).length).toBe(4);
    expect(filterRows(rows, { ...base, includeGaps: true }).length).toBe(5);
    expect(filterRows(rows, { ...base, status: "proposed" }).map((r) => r.sku)).toEqual(["D"]);
    expect(filterRows(rows, { ...base, query: "clorox" }).map((r) => r.sku)).toEqual(["C"]);
  });

  it("sorts by penetration", () => {
    expect(sortRows(rows.filter((r) => r.sku), "share12", "desc").map((r) => r.sku)).toEqual(["A", "C", "D", "B"]);
  });
});

describe("overview and export", () => {
  it("measures coverage by department and lists must gaps", () => {
    expect(coverageByDepartment(index).map((c) => [c.label, c.items, c.covered, c.byPriority.must.covered])).toEqual([
      ["Soft drinks", 2, 1, 1],
      ["Household", 1, 1, 1],
    ]);
    expect(mustGaps(index)).toEqual([]);
  });

  it("writes CSV with percentages and a gap marker", () => {
    const csv = rowsToCsv(rows);
    expect(csv.split("\n")[1]).toBe("Soft drinks,Cola,Coca-Cola › Classic › 20oz bottle,Branded,must,A,Coca-Cola 20 oz (24 Pack),24,68.0,34.0,approved,scd.cola.coke.classic.20oz,,,,");
    expect(csv).toContain("(no Mercaso SKU)");
  });

  it("adds price, cost and margin when a price file is present", () => {
    const priced = withPrices(rows, { as_of: "2026-09-28", prices: { A: { price: 37.49, promo: false, cost: 35.48, margin: 0.0536 }, C: { price: 29.49, promo: true } } });
    expect(priced[0]).toMatchObject({ price: 37.49, promo: false, cost: 35.48, margin: 0.0536 });
    expect(priced[3]).toMatchObject({ price: 29.49, promo: true });
    expect(priced[3]?.margin).toBeUndefined();
    expect(groupRows(priced, "department")[0]?.stats.avgMargin).toBeCloseTo(0.0536);
    expect(sortRows(priced.filter((r) => r.sku), "margin", "desc")[0]?.sku).toBe("A");
    expect(rowsToCsv(priced).split("\n")[1]).toMatch(/,37\.49,regular,35\.48,5\.4$/);
    expect(withPrices(rows, null)).toBe(rows);
  });
});
