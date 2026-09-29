/**
 * Phase 4 matcher for the liquor store type. Reads data/raw/products.csv and
 * data/raw/liquor_sales_by_sku.csv (from `pnpm athena:export`) and writes proposed matches to
 * data/matches/liquor.csv as status `auto`, source `rule`.
 *
 * Rows a person already approved or rejected, and rows added by hand (source `manual`), are kept
 * as they are, and no auto row is added for a SKU already on that leaf, so rerunning after a
 * review is safe.
 *
 * Only ACTIVE items are matched. Per leaf it keeps the best 3 SKUs for a branded size leaf and
 * target max + 1 for an assortment slot, ranked by how many liquor stores bought them.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { toCsv } from "../athena/lib.ts";
import { leafTargets } from "../crosscheck/lib.ts";
import { loadCatalog } from "../lib/load.ts";
import { MATCH_COLUMNS, summarizeMatches } from "../lib/matches.ts";
import { buildCatalogJson } from "../lib/output.ts";
import { keepCasePacks, matchCatalog, type Product } from "./lib.ts";

const ROOT = process.cwd();
const MATCH_FILE = join(ROOT, "data/matches/liquor.csv");

const readCsv = (path: string, hint: string): Record<string, string>[] => {
  try {
    return parse(readFileSync(path, "utf8"), { columns: true });
  } catch {
    console.error(`${path} is missing. ${hint}`);
    process.exit(1);
  }
};

const { storeTypes } = loadCatalog(ROOT);
const liquor = storeTypes.find((s) => s.resolved.def.store_type === "liquor");
if (!liquor) throw new Error("store type liquor not found");
const tree = buildCatalogJson(liquor.resolved, summarizeMatches([], liquor.resolved));
const targets = leafTargets(tree.departments);

const sales = new Map(
  readCsv(join(ROOT, "data/raw/liquor_sales_by_sku.csv"), "Run pnpm athena:export liquor-sales.").map((r) => [
    r.sku!,
    { share: Number(r.store_share) || 0, share90: Number(r.store_share_90d) || 0 },
  ]),
);
const products: Product[] = readCsv(join(ROOT, "data/raw/products.csv"), "Run pnpm athena:export products.")
  .filter((r) => r.availability_status === "ACTIVE")
  .map((r) => ({
    sku: r.sku_number!,
    title: r.title ?? "",
    brand_name: r.brand_name ?? "",
    department: r.department ?? "",
    category: r.category ?? "",
    sub_category: r.sub_category ?? "",
    package_size: Math.max(1, Math.round(Number(r.package_size) || 1)),
    ...(Number(r.item_size) > 0 ? { item_size: Number(r.item_size) } : {}),
    ...(r.item_size_unit ? { item_size_unit: r.item_size_unit } : {}),
    store_share: sales.get(r.sku_number!)?.share ?? 0,
    store_share_90d: sales.get(r.sku_number!)?.share90 ?? 0,
  }));

// Keep human decisions from an earlier run.
const existing: Record<string, string>[] = (() => {
  try {
    return parse(readFileSync(MATCH_FILE, "utf8"), { columns: true });
  } catch {
    return [];
  }
})();
const decided = existing.filter((r) => r.status === "approved" || r.status === "rejected" || r.source === "manual");
const decidedKeys = new Set(decided.map((r) => `${r.node_id}|${r.mercaso_sku}`));

const byLeaf = matchCatalog(targets, products);
const rows: string[][] = [[...MATCH_COLUMNS]];
// Kept rows get today's store shares; everything else stays as reviewed.
const shareCell = (x: number | undefined) => (x === undefined ? "" : x.toFixed(4));
for (const r of decided) {
  const s = sales.get(r.mercaso_sku ?? "");
  rows.push(MATCH_COLUMNS.map((c) => (c === "share_12m" ? shareCell(s?.share ?? 0) : c === "share_90d" ? shareCell(s?.share90 ?? 0) : (r[c] ?? ""))));
}
let proposed = 0;
let empty = 0;
let settled = 0;
for (const t of targets) {
  const keep = t.kind === "size" ? 3 : (t.target?.max ?? 1) + 1;
  // A leaf that already has a hand-added or approved SKU needs no rule proposals beyond it.
  const covered = decided.some((r) => r.node_id === t.id && r.status !== "rejected");
  const open = covered ? [] : (byLeaf.get(t.id) ?? []).filter((c) => !decidedKeys.has(`${t.id}|${c.product.sku}`));
  const list = (t.kind === "size" ? keepCasePacks(open) : open).slice(0, keep);
  if (covered) settled++;
  else if (list.length === 0) empty++;
  list.forEach((c, i) => {
    proposed++;
    rows.push([
      t.id,
      c.product.sku,
      c.product.title,
      String(c.product.package_size),
      String(i + 1),
      c.confidence.toFixed(2),
      shareCell(c.product.store_share),
      shareCell(c.product.store_share_90d),
      "auto",
      "rule",
      "",
      "",
    ]);
  });
}
writeFileSync(MATCH_FILE, toCsv(rows));
console.log(`${products.length} active Mercaso items; ${targets.length} carried leaves.`);
console.log(
  `wrote data/matches/liquor.csv: ${decided.length} reviewed or hand-added rows kept (${settled} leaves settled), ${proposed} proposed; ${empty} leaves with no candidate.`,
);
