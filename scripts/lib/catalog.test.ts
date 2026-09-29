import { describe, expect, it } from "vitest";
import { loadCatalog } from "./load.ts";
import { parseMatches, summarizeMatches } from "./matches.ts";
import { buildCatalogJson } from "./output.ts";
import { resolveStoreType } from "./store-type.ts";
import { buildTaxonomy, type DepartmentSource } from "./taxonomy.ts";
import type { AuthoredNode, Issue, StoreTypeFile } from "./types.ts";

const errors = (issues: Issue[]) => issues.filter((i) => i.level === "error").map((i) => `${i.where}: ${i.message}`);

function dept(overrides: Partial<AuthoredNode> = {}): AuthoredNode {
  return {
    key: "scd",
    name: "Soft drinks",
    kind: "department",
    size_classes: { single: "grab and go", take_home: "1L+" },
    size_defs: {
      "20oz": { name: "20oz", size_class: "single" },
      "2l": { name: "2L", size_class: "take_home" },
    },
    children: [
      {
        key: "cola",
        name: "Cola",
        kind: "category",
        children: [
          {
            key: "coke",
            name: "Coca-Cola",
            kind: "brand_line",
            sizes: ["20oz", "2l"],
            children: [
              { key: "classic", name: "Classic", kind: "variant" },
              { key: "zero", name: "Zero", kind: "variant", sizes: ["20oz"] },
            ],
          },
        ],
      },
      {
        key: "tobacco",
        name: "Tobacco",
        kind: "category",
        age_restricted: true,
        children: [
          {
            key: "slot",
            name: "Lighters",
            kind: "assortment_slot",
            target_count: { min: 2, max: 3 },
            mix: ["value", "national"],
          },
          {
            key: "menthol",
            name: "Menthol",
            kind: "assortment_slot",
            target_count: { min: 1, max: 1 },
            restricted: ["CA"],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function taxonomyOf(root: AuthoredNode) {
  const departments = new Map<string, DepartmentSource>([[root.key, { file: "scd.yaml", data: root }]]);
  return buildTaxonomy({ departments: [root.key] }, departments);
}

function storeType(overrides: Partial<StoreTypeFile> = {}): StoreTypeFile {
  return {
    store_type: "liquor",
    name: "Liquor",
    include: ["scd"],
    priority: { scd: "should", "scd.cola.coke.classic": "must" },
    ...overrides,
  };
}

describe("taxonomy", () => {
  it("builds dotted ids and expands sizes from the brand line or the variant", () => {
    const { taxonomy, issues } = taxonomyOf(dept());
    expect(errors(issues)).toEqual([]);
    expect(taxonomy.byId.has("scd.cola.coke.classic.20oz")).toBe(true);
    expect(taxonomy.byId.has("scd.cola.coke.classic.2l")).toBe(true);
    expect(taxonomy.byId.has("scd.cola.coke.zero.2l")).toBe(false);
    expect(taxonomy.byId.get("scd.cola.coke.classic.2l")?.attrs.size_class).toBe("take_home");
  });

  it("rejects kinds in the wrong place", () => {
    const bad = dept({
      children: [{ key: "coke", name: "Coke", kind: "brand_line", sizes: ["20oz"], children: [{ key: "a", name: "A", kind: "variant" }] }],
    });
    expect(errors(taxonomyOf(bad).issues)).toContain("scd.coke: a brand_line cannot sit under a department");
  });

  it("rejects unknown sizes, duplicate keys and bad size classes", () => {
    const bad = dept({
      size_defs: { "20oz": { name: "20oz", size_class: "huge" } },
      children: [
        {
          key: "cola",
          name: "Cola",
          kind: "category",
          children: [
            { key: "coke", name: "Coke", kind: "brand_line", children: [{ key: "a", name: "A", kind: "variant", sizes: ["1l"] }] },
            { key: "coke", name: "Coke again", kind: "brand_line", sizes: ["20oz"], children: [{ key: "a", name: "A", kind: "variant" }] },
          ],
        },
      ],
    });
    const errs = errors(taxonomyOf(bad).issues);
    expect(errs).toContain('scd.cola.coke.a: size "1l" is not defined in any size_defs in scope');
    expect(errs).toContain('scd.cola.coke: duplicate id "scd.cola.coke"; sibling keys must be unique');
    expect(errs.some((e) => e.includes('uses size class "huge"'))).toBe(true);
  });

  it("requires target_count on slots and keeps slot attrs off other kinds", () => {
    const bad = dept({
      children: [
        {
          key: "home",
          name: "Home",
          kind: "category",
          mix: ["value"],
          children: [{ key: "soap", name: "Soap", kind: "assortment_slot" }],
        },
      ],
    });
    const errs = errors(taxonomyOf(bad).issues);
    expect(errs).toContain("scd.home: `mix` only applies to assortment_slot nodes");
    expect(errs).toContain("scd.home.soap: assortment_slot needs a target_count");
  });

  it("checks cross references", () => {
    const withRef = dept();
    (withRef.children![1]!.children![0] as AuthoredNode).cross_ref = ["scd.cola.coke.classic", "scd.nope"];
    const errs = errors(taxonomyOf(withRef).issues);
    expect(errs).toEqual(['scd.tobacco.slot: cross_ref "scd.nope" does not resolve to a node']);
  });
});

describe("store type", () => {
  const { taxonomy } = taxonomyOf(dept());

  it("inherits priority down the tree and lets descendants override", () => {
    const { resolved, issues } = resolveStoreType(storeType(), "liquor.yaml", taxonomy);
    expect(errors(issues)).toEqual([]);
    const byId = new Map(resolved.leaves.map((l) => [l.node.id, l]));
    expect(byId.get("scd.cola.coke.classic.20oz")?.priority).toBe("must");
    expect(byId.get("scd.cola.coke.classic.20oz")?.prioritySource).toBe("inherited");
    expect(byId.get("scd.cola.coke.zero.20oz")?.priority).toBe("should");
  });

  it("reports leaves with no priority", () => {
    const { issues } = resolveStoreType(storeType({ priority: { "scd.cola": "must" } }), "liquor.yaml", taxonomy);
    expect(errors(issues)).toContain("scd.tobacco.slot: leaf has no priority (set one on it or an ancestor)");
  });

  it("drops nodes restricted in the store type's state", () => {
    const { resolved } = resolveStoreType(storeType({ state: "CA" }), "liquor.yaml", taxonomy);
    expect(resolved.droppedRestricted).toEqual(["scd.tobacco.menthol"]);
    expect(resolved.leaves.map((l) => l.node.id)).not.toContain("scd.tobacco.menthol");
    const { resolved: tx } = resolveStoreType(storeType({ state: "TX" }), "liquor.yaml", taxonomy);
    expect(tx.leaves.map((l) => l.node.id)).toContain("scd.tobacco.menthol");
  });

  it("supports include and exclude and flags priorities on nodes it does not carry", () => {
    const { resolved, issues } = resolveStoreType(
      storeType({
        include: ["scd.cola"],
        exclude: ["scd.cola.coke.zero"],
        priority: { "scd.cola": "must", "scd.cola.coke.zero": "nice", "scd.tobacco": "nice" },
      }),
      "liquor.yaml",
      taxonomy,
    );
    expect(resolved.leaves.map((l) => l.node.id)).toEqual(["scd.cola.coke.classic.20oz", "scd.cola.coke.classic.2l"]);
    expect(errors(issues)).toEqual([
      'scd.cola.coke.zero: priority is set on "scd.cola.coke.zero", which this store type does not carry',
      'scd.tobacco: priority is set on "scd.tobacco", which this store type does not carry',
    ]);
  });

  it("rejects an exclude that empties its parent, and unknown ids", () => {
    const { issues } = resolveStoreType(
      storeType({ exclude: ["scd.cola.coke.classic", "scd.cola.coke.zero", "scd.missing"] }),
      "liquor.yaml",
      taxonomy,
    );
    const errs = errors(issues);
    expect(errs).toContain('scd.cola.coke: everything under "scd.cola.coke" is excluded; exclude "scd.cola.coke" itself instead');
    expect(errs).toContain('scd.missing: exclude refers to "scd.missing", which is not a taxonomy node');
  });

  it("warns when an explicit priority repeats the inherited one", () => {
    const { issues } = resolveStoreType(
      storeType({ priority: { scd: "should", "scd.cola": "should" } }),
      "liquor.yaml",
      taxonomy,
    );
    expect(issues.filter((i) => i.level === "warning").map((i) => i.where)).toEqual(["scd.cola"]);
  });
});

describe("matches and output", () => {
  const { taxonomy } = taxonomyOf(dept());
  const { resolved } = resolveStoreType(storeType(), "liquor.yaml", taxonomy);
  const header = "node_id,mercaso_sku,case_pack,rank,confidence,status,source,reviewer,note";

  it("validates rows", () => {
    const csv = [
      header,
      "scd.cola.coke.classic,123,24,1,0.9,approved,rule,rick,",
      "scd.cola.coke.classic.20oz,123,24,1,1.5,approved,rule,rick,",
      "scd.cola.coke.classic.20oz,124,24,1,0.9,approved,rule,,",
      "scd.cola.coke.classic.20oz,125,24,1,0.9,maybe,rule,rick,",
    ].join("\n");
    const errs = errors(parseMatches(csv, "liquor.csv", taxonomy).issues);
    expect(errs).toEqual([
      'line 2: node_id "scd.cola.coke.classic" is a variant; matches attach to size or assortment_slot leaves',
      'line 3: confidence "1.5" must be between 0 and 1',
      "line 4: rows with status approved need a reviewer",
      'line 5: status "maybe" must be one of: auto, approved, rejected',
    ]);
  });

  it("summarizes coverage for branded leaves and assortment slots", () => {
    const csv = [
      header,
      "scd.cola.coke.classic.20oz,100,24,1,,approved,manual,rick,",
      "scd.cola.coke.classic.20oz,101,35,2,,approved,manual,rick,Coke 35-count case",
      "scd.cola.coke.classic.2l,102,8,1,0.7,auto,llm,,",
      "scd.tobacco.slot,200,,1,,approved,rule,rick,",
      "scd.tobacco.slot,201,,2,,rejected,rule,rick,",
    ].join("\n");
    const { rows, issues } = parseMatches(csv, "liquor.csv", taxonomy);
    expect(errors(issues)).toEqual([]);
    const summary = summarizeMatches(rows, resolved);
    expect(summary.get("scd.cola.coke.classic.20oz")?.status).toBe("matched");
    expect(summary.get("scd.cola.coke.classic.20oz")?.skus.map((s) => s.case_pack)).toEqual([24, 35]);
    expect(summary.get("scd.cola.coke.classic.2l")).toMatchObject({ status: "gap", pending: 1 });
    expect(summary.get("scd.tobacco.slot")).toMatchObject({ status: "partial", approved: 1, rejected: 1 });
    expect(summary.get("scd.tobacco.menthol")?.status).toBe("gap");

    const json = buildCatalogJson(resolved, summary);
    expect(json.summary.match).toEqual({ matched: 1, covered: 0, partial: 1, gap: 3 });
    expect(json.summary.by_kind).toEqual({ size: 3, assortment_slot: 2 });
    const tobacco = json.departments[0]?.children?.[1];
    expect(tobacco?.children?.[0]?.attrs.age_restricted).toBe(true);
  });
});

describe("repository data", () => {
  it("validates with no errors or warnings", () => {
    const { issues, storeTypes } = loadCatalog(process.cwd());
    expect(issues).toEqual([]);
    expect(storeTypes.map((s) => s.resolved.def.store_type)).toContain("liquor");
  });
});
