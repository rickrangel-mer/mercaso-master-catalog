/**
 * Phase 2.5 sales cross-check for the liquor store type. Reads data/raw/liquor_sales_by_sku.csv
 * (from `pnpm athena:export liquor-sales`) and writes three CSVs to data/raw/crosscheck/:
 *
 *   leaves.csv     every carried leaf with the SKUs matched to it and their best store share
 *   unmatched.csv  in-scope SKUs bought by at least 5% of liquor stores that match no leaf
 *   verify.csv     for each `verify` node, the top SKUs of its brand or slot
 *   discontinued.csv  SKUs bought by at least 5% of stores that are no longer ACTIVE
 *
 * Only ACTIVE items (data/raw/products.csv) are matched: a discontinued SKU keeps its full-year
 * share, and its replacement looks weak. store_share_90d, over the last 90 days, shows what sells
 * now; it runs lower than the 12-month share, so compare it only with other 90-day shares.
 *
 * store_share is the fraction of active CA liquor stores that bought the SKU in 12 months.
 * relative_pct divides it by the reach of the SKU's Mercaso category (liquor_reach_by_category.csv,
 * from `pnpm athena:export liquor-reach`), since few stores buy tobacco or cleaning from Mercaso.
 * The findings and decisions live in docs/exploration/sales-crosscheck.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { toCsv } from "../athena/lib.ts";
import { loadCatalog } from "../lib/load.ts";
import { summarizeMatches } from "../lib/matches.ts";
import { buildCatalogJson, type OutputNode } from "../lib/output.ts";
import { brandHits, DEPARTMENT_SCOPE, leafTargets, matchRows, tokens, type SalesRow } from "./lib.ts";

const ROOT = process.cwd();
const OUT = join(ROOT, "data/raw/crosscheck");
const UNMATCHED_MIN_SHARE = 0.05;
/** Mercaso departments outside the liquor store's non-alcoholic, shelf-stable scope. */
const OUT_OF_SCOPE = new Set(["Frozen", "Deli & Produce", "Placeholder", "WITHOUT DEPARTMENT"]);

const { storeTypes } = loadCatalog(ROOT);
const liquor = storeTypes.find((s) => s.resolved.def.store_type === "liquor");
if (!liquor) throw new Error("store type liquor not found");
const tree = buildCatalogJson(liquor.resolved, summarizeMatches(liquor.matches, liquor.resolved));

let raw: Record<string, string>[];
try {
  raw = parse(readFileSync(join(ROOT, "data/raw/liquor_sales_by_sku.csv"), "utf8"), { columns: true });
} catch {
  console.error("data/raw/liquor_sales_by_sku.csv is missing. Run pnpm athena:export liquor-sales first.");
  process.exit(1);
}
const rows: SalesRow[] = raw.map((r) => ({
  sku: r.sku!,
  title: r.title ?? "",
  brand_name: r.brand_name ?? "",
  department: r.department ?? "",
  category: r.category ?? "",
  sub_category: r.sub_category ?? "",
  package_size: Number(r.package_size) || 1,
  cases: Number(r.cases) || 0,
  units: Number(r.units) || 0,
  orders: Number(r.orders) || 0,
  stores_buying: Number(r.stores_buying) || 0,
  store_share: Number(r.store_share) || 0,
  store_share_90d: Number(r.store_share_90d) || 0,
  first_order_date: r.first_order_date ?? "",
  last_order_date: r.last_order_date ?? "",
  status: "",
}));
if (!raw[0] || !("store_share_90d" in raw[0])) {
  console.warn("liquor_sales_by_sku.csv predates the 90-day columns. Rerun pnpm athena:export liquor-sales.");
}

// Item status, so discontinued SKUs are not matched.
try {
  const products: Record<string, string>[] = parse(readFileSync(join(ROOT, "data/raw/products.csv"), "utf8"), { columns: true });
  const status = new Map(products.map((p) => [p.sku_number!, p.availability_status ?? ""]));
  for (const r of rows) r.status = status.get(r.sku) ?? "";
} catch {
  console.warn("data/raw/products.csv is missing; discontinued SKUs cannot be excluded. Run pnpm athena:export products.");
}
const isLive = (r: SalesRow) => r.status === "ACTIVE" || r.status === "";
const live = rows.filter(isLive);
const activeStores = Number(raw[0]?.liquor_stores_active) || 0;

// Share of stores buying anything in each Mercaso category; optional.
const reach = new Map<string, number>();
try {
  const reachRows: Record<string, string>[] = parse(readFileSync(join(ROOT, "data/raw/liquor_reach_by_category.csv"), "utf8"), { columns: true });
  for (const r of reachRows) if (r.category) reach.set(`${r.department}|${r.category}`, Number(r.store_share));
} catch {
  console.warn("data/raw/liquor_reach_by_category.csv is missing; relative_pct will be blank. Run pnpm athena:export liquor-reach.");
}
const relative = (r: SalesRow) => {
  const c = reach.get(`${r.department}|${r.category}`);
  return c ? ((r.store_share / c) * 100).toFixed(0) : "";
};

const targets = leafTargets(tree.departments);
const byLeaf = matchRows(targets, live);
const matchedSkus = new Set([...byLeaf.values()].flat().map((r) => r.sku));
const top = (list: SalesRow[]) => [...list].sort((a, b) => b.store_share - a.store_share);
const pct = (x: number) => (x * 100).toFixed(1);

mkdirSync(OUT, { recursive: true });

// 1. Every leaf with its matched SKUs.
const leafRows = [["id", "priority", "verify", "path", "skus", "best_share_pct", "best_share_90d_pct", "relative_pct", "units", "best_title", "best_sku"]];
for (const t of targets) {
  const list = top(byLeaf.get(t.id) ?? []);
  const best = list[0];
  leafRows.push([
    t.id,
    t.priority ?? "",
    t.verify ?? "",
    t.path,
    String(list.length),
    best ? pct(best.store_share) : "",
    list.length ? pct(Math.max(...list.map((r) => r.store_share_90d))) : "",
    best ? relative(best) : "",
    String(list.reduce((s, r) => s + r.units, 0)),
    best?.title ?? "",
    best?.sku ?? "",
  ]);
}
writeFileSync(join(OUT, "leaves.csv"), toCsv(leafRows));

// 2. Well-bought SKUs that match no leaf, marked by whether their brand appears anywhere in the tree.
const catalogBrands: string[][] = targets.flatMap((t) => t.brandOptions).filter((b) => b.length > 0);
const unmatchedRows = [["sku", "store_share_pct", "store_share_90d_pct", "first_order_date", "relative_pct", "units", "brand_in_catalog", "department", "category", "sub_category", "brand_name", "title"]];
for (const r of top(live)) {
  if (r.store_share < UNMATCHED_MIN_SHARE || matchedSkus.has(r.sku) || OUT_OF_SCOPE.has(r.department)) continue;
  const text = new Set(tokens(`${r.brand_name} ${r.title}`));
  const skuBrand = tokens(r.brand_name);
  const known = catalogBrands.some((b) => brandHits(b, text, skuBrand) > 0);
  unmatchedRows.push([r.sku, pct(r.store_share), pct(r.store_share_90d), r.first_order_date, relative(r), String(r.units), known ? "yes" : "no", r.department, r.category, r.sub_category, r.brand_name, r.title]);
}
writeFileSync(join(OUT, "unmatched.csv"), toCsv(unmatchedRows));

// 3. For each verify node, the top SKUs of its brand (brand lines) or of its hinted brands (slots).
const verifyRows = [["node_id", "verify", "priority", "rank", "store_share_pct", "store_share_90d_pct", "relative_pct", "units", "sku", "title"]];
const walk = (node: OutputNode, dept: string) => {
  if (node.attrs.verify) {
    const names = node.kind === "brand_line" ? [node.name] : (node.attrs.brand_hints ?? []);
    const brands = names.map(tokens);
    const scope = DEPARTMENT_SCOPE[dept] ?? [];
    const hits = top(
      live.filter((r) => {
        if (!scope.includes(r.department)) return false;
        const text = new Set(tokens(`${r.brand_name} ${r.title}`));
        return brands.some((b) => b.every((t) => text.has(t)));
      }),
    ).slice(0, 12);
    hits.forEach((r, i) =>
      verifyRows.push([node.id, node.attrs.verify!, node.priority ?? "", String(i + 1), pct(r.store_share), pct(r.store_share_90d), relative(r), String(r.units), r.sku, r.title]),
    );
    if (hits.length === 0) verifyRows.push([node.id, node.attrs.verify, node.priority ?? "", "", "", "", "", "", "", "(no brand SKUs; see the report)"]);
  }
  for (const c of node.children ?? []) walk(c, dept);
};
for (const d of tree.departments) walk(d, d.key);
writeFileSync(join(OUT, "verify.csv"), toCsv(verifyRows));

// 4. Discontinued SKUs that still carry a big 12-month share; their replacements look weak.
const discRows = [["sku", "status", "store_share_pct", "store_share_90d_pct", "last_order_date", "department", "title"]];
for (const r of top(rows)) {
  if (isLive(r) || r.store_share < UNMATCHED_MIN_SHARE) continue;
  discRows.push([r.sku, r.status, pct(r.store_share), pct(r.store_share_90d), r.last_order_date, r.department, r.title]);
}
writeFileSync(join(OUT, "discontinued.csv"), toCsv(discRows));

const withSales = targets.filter((t) => byLeaf.has(t.id)).length;
console.log(`${activeStores} active CA liquor stores; ${rows.length} SKUs bought in 12 months, ${live.length} still active.`);
console.log(`${withSales} of ${targets.length} leaves matched at least one SKU; ${matchedSkus.size} SKUs matched.`);
console.log(`wrote data/raw/crosscheck/leaves.csv, unmatched.csv (${unmatchedRows.length - 1} rows), verify.csv, discontinued.csv (${discRows.length - 1} rows)`);
