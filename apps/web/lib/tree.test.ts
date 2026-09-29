import { describe, expect, it } from "vitest";
import type { OutputNode, StoreTypeCatalog } from "./tree.ts";
import { expandForHits, filterTree, indexCatalog, NO_FILTERS, visibleTree } from "./tree.ts";

const gap = { status: "gap" as const, approved: 0, pending: 0, rejected: 0, skus: [] };

function leaf(id: string, name: string, priority: "must" | "should" | "nice", extra: Partial<OutputNode> = {}): OutputNode {
  return { id, key: id.split(".").pop()!, name, kind: "size", priority, attrs: {}, match: gap, ...extra };
}

const catalog: StoreTypeCatalog = {
  schema_version: 1,
  store_type: "liquor",
  name: "Liquor store",
  summary: {
    leaves: 3,
    by_kind: { size: 2, assortment_slot: 1 },
    by_priority: { must: 1, should: 1, nice: 1 },
    match: { matched: 1, covered: 0, partial: 0, gap: 2 },
    verify: { sales: 1, stock: 0 },
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
          attrs: { verify: "sales" },
          children: [
            leaf("scd.cola.coke-20oz", "Coke 20oz", "must", { match: { ...gap, status: "matched", approved: 1 } }),
            leaf("scd.cola.pepsi-20oz", "Pepsi 20oz", "nice"),
          ],
        },
        {
          id: "scd.mixers",
          key: "mixers",
          name: "Mixers",
          kind: "category",
          attrs: { cross_ref: ["scd.cola"] },
        },
      ],
    },
    {
      id: "home",
      key: "home",
      name: "Household",
      kind: "department",
      attrs: {},
      children: [
        {
          id: "home.soap",
          key: "soap",
          name: "Dish soap",
          kind: "assortment_slot",
          priority: "should",
          attrs: { brand_hints: ["Palmolive"], target_count: { min: 2, max: 2 } },
          match: gap,
        },
      ],
    },
  ],
};

const index = indexCatalog(catalog);
const ids = (n: { id: string; children: { id: string; children: unknown[] }[] }): string[] => [
  n.id,
  ...n.children.flatMap((c) => ids(c as never)),
];

describe("indexCatalog", () => {
  it("rolls up leaf counts and inherits verify flags", () => {
    expect(index.rollup.get("__store__")).toEqual({ leaves: 3, must: 1, should: 1, nice: 1, gap: 2 });
    expect(index.rollup.get("scd.cola")).toEqual({ leaves: 2, must: 1, should: 0, nice: 1, gap: 1 });
    expect(index.flagged.has("scd.cola.pepsi-20oz")).toBe(true);
    expect(index.flagged.has("home.soap")).toBe(false);
  });
});

describe("filterTree", () => {
  it("keeps everything with no filters", () => {
    expect(ids(filterTree(index, NO_FILTERS).tree)).toHaveLength(8);
  });

  it("matches brand hints and keeps ancestors", () => {
    const { tree, hits } = filterTree(index, { ...NO_FILTERS, query: "palmolive" });
    expect(ids(tree)).toEqual(["__store__", "home", "home.soap"]);
    expect([...hits]).toEqual(["home.soap"]);
  });

  it("matches a key without hitting every descendant, and full ids only for dotted terms", () => {
    expect([...filterTree(index, { ...NO_FILTERS, query: "cola" }).hits]).toEqual(["scd.cola"]);
    expect([...filterTree(index, { ...NO_FILTERS, query: "scd.cola.pepsi" }).hits]).toEqual(["scd.cola.pepsi-20oz"]);
  });

  it("keeps the whole subtree under a matched category", () => {
    const { tree } = filterTree(index, { ...NO_FILTERS, query: "cola" });
    expect(ids(tree)).toContain("scd.cola.pepsi-20oz");
    expect(ids(tree)).not.toContain("home.soap");
  });

  it("filters leaves by priority, gaps and verify flags, and hides links", () => {
    expect(ids(filterTree(index, { ...NO_FILTERS, priorities: ["must"] }).tree)).toEqual(["__store__", "scd", "scd.cola", "scd.cola.coke-20oz"]);
    expect(ids(filterTree(index, { ...NO_FILTERS, gapsOnly: true }).tree)).not.toContain("scd.cola.coke-20oz");
    expect(ids(filterTree(index, { ...NO_FILTERS, flaggedOnly: true }).tree)).not.toContain("home.soap");
    expect(ids(filterTree(index, { ...NO_FILTERS, gapsOnly: true }).tree)).not.toContain("scd.mixers");
  });
});

describe("expansion", () => {
  it("opens the path to every hit", () => {
    const { tree, hits } = filterTree(index, { ...NO_FILTERS, query: "pepsi" });
    expect([...expandForHits(tree, hits)].sort()).toEqual(["__store__", "scd", "scd.cola"]);
  });

  it("collapses unexpanded nodes and counts hidden children", () => {
    const v = visibleTree(index.root, new Set(["scd"]));
    expect(v.children.map((c) => [c.view.id, c.children.length, c.hidden])).toEqual([
      ["scd", 2, 0],
      ["home", 0, 1],
    ]);
  });
});
