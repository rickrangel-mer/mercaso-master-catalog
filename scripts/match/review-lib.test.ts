import { describe, expect, it } from "vitest";
import { applyReview, gapSheet, gapSkuCell, pendingSheet, splitSkus, type LeafInfo, type MatchRecord } from "./review-lib.ts";

const leaves: LeafInfo[] = [
  { id: "mixers.tools.corkscrew", department: "Mixers", item: "Bar tools › Corkscrew", priority: "must", kind: "Slot", target: "1", brandHints: "" },
  { id: "drinks.water.topo.lime", department: "Drinks", item: "Water › Topo Chico › Twist of Lime", priority: "must", kind: "Branded", target: "", brandHints: "" },
  { id: "scd.cola.rc", department: "Soft drinks", item: "Cola › RC", priority: "nice", kind: "Branded", target: "", brandHints: "" },
];
const row = (node_id: string, sku: string, status: string, rank = "1"): MatchRecord => ({
  node_id,
  mercaso_sku: sku,
  title: `Product ${sku}`,
  case_pack: "12",
  rank,
  confidence: "0.50",
  share_12m: "0.0310",
  share_90d: "0.0100",
  status,
  source: "rule",
  reviewer: "",
  note: "",
});
const matches = [row("mixers.tools.corkscrew", "A1", "auto"), row("mixers.tools.corkscrew", "A2", "auto", "2"), row("scd.cola.rc", "R1", "rejected")];

describe("review sheets", () => {
  it("lists pending matches with an empty decision, and items with no SKU must first", () => {
    const pending = pendingSheet(leaves, matches);
    expect(pending.slice(1).map((r) => [r[0], r[5], r[9]])).toEqual([
      ["", "A1", "3.1"],
      ["", "A2", "3.1"],
    ]);
    expect(gapSheet(leaves, matches).slice(1).map((r) => r.at(-1))).toEqual(["drinks.water.topo.lime", "scd.cola.rc"]);
  });

  it("applies decisions and gap SKUs, and reports what it could not use", () => {
    const products = new Map([
      ["T1", { sku: "T1", title: "Topo Chico Lime 12 oz (24 Pack)", casePack: "24", active: true }],
      ["T2", { sku: "T2", title: "Old Topo", casePack: "24", active: false }],
      ["R1", { sku: "R1", title: "RC Cola 12 oz (24 Pack)", casePack: "24", active: true }],
    ]);
    const r = applyReview(
      matches,
      [
        { node_id: "mixers.tools.corkscrew", mercaso_sku: "A1", decision: "Approve", note: "fine" },
        { node_id: "mixers.tools.corkscrew", mercaso_sku: "A2", decision: "no" },
        { node_id: "mixers.tools.corkscrew", mercaso_sku: "A3", decision: "maybe" },
      ],
      [
        { node_id: "drinks.water.topo.lime", mercaso_sku: "t1; T2 X9" },
        { node_id: "scd.cola.rc", mercaso_sku: "R1" },
      ],
      products,
      "rick",
      "2026-09-30",
    );
    expect([r.approved, r.rejected, r.added]).toEqual([1, 1, 3]);
    expect(r.matches.find((m) => m.mercaso_sku === "A1")).toMatchObject({ status: "approved", reviewer: "rick", note: "fine · Review sheet (rick, 2026-09-30)" });
    expect(r.matches.find((m) => m.mercaso_sku === "A2")?.status).toBe("rejected");
    expect(r.matches.find((m) => m.mercaso_sku === "T1")).toMatchObject({ node_id: "drinks.water.topo.lime", title: "Topo Chico Lime 12 oz (24 Pack)", status: "approved", source: "manual" });
    // R1 was rejected by the matcher review; writing it on the gap sheet overrides that.
    expect(r.matches.filter((m) => m.mercaso_sku === "R1")).toHaveLength(1);
    expect(r.matches.find((m) => m.mercaso_sku === "R1")).toMatchObject({ status: "approved", source: "manual" });
    expect(r.problems).toEqual([
      'pending mixers.tools.corkscrew A3: decision "maybe" is not approve or reject',
      "gap drinks.water.topo.lime: SKU T2 is not ACTIVE (added anyway)",
      "gap drinks.water.topo.lime: SKU X9 is not in products.csv",
    ]);
  });

  it("takes SKUs typed into target_skus by mistake, but not an item count", () => {
    expect(gapSkuCell({ mercaso_sku: "", target_skus: "DW10597-36" })).toBe("DW10597-36");
    expect(gapSkuCell({ mercaso_sku: "", target_skus: "2-3" })).toBe("");
    expect(gapSkuCell({ mercaso_sku: "A1", target_skus: "B2" })).toBe("A1");
  });

  it("skips decisions already applied, so a sheet can be imported twice", () => {
    const once = applyReview(matches, [{ node_id: "mixers.tools.corkscrew", mercaso_sku: "A1", decision: "yes" }], [], null, "rick", "2026-09-30");
    const twice = applyReview(once.matches, [{ node_id: "mixers.tools.corkscrew", mercaso_sku: "A1", decision: "yes" }], [], null, "rick", "2026-09-30");
    expect([twice.approved, twice.problems]).toEqual([0, []]);
    expect(twice.matches).toEqual(once.matches);
  });

  it("splits SKUs on common separators", () => {
    expect(splitSkus(" dw1 , DW2|dw3;\nDW4 ")).toEqual(["DW1", "DW2", "DW3", "DW4"]);
  });
});
