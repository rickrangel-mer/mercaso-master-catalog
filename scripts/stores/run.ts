/**
 * Store view for the liquor store type: how much of the master catalog each store buys from
 * Mercaso, its peers, its voids and its health. Reads data/raw/liquor_stores.csv and
 * liquor_store_skus.csv (`pnpm athena:export liquor-stores liquor-store-skus`), plus
 * data/raw/pricing.csv when present. Writes, all under the gitignored dist/stores/:
 *   liquor.json         the base file for the site's Stores tab, which scores it in the browser for
 *                       whatever "carried" window the viewer picks
 * The CSVs are scored for the default window: an item counts as carried if bought in 90 days.
 *   liquor-stores.csv   one row per store (the store table)
 *   liquor-voids.csv    per store, its 30 missing must/should items most bought by its peers
 *                       (the rep and pricing list; items on supply hold are left out; the site
 *                       shows every void, holds tagged)
 * Store names, spend and prices stay out of git.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { toCsv } from "../athena/lib.ts";
import { loadCatalog } from "../lib/load.ts";
import { summarizeMatches } from "../lib/matches.ts";
import { buildCatalogJson } from "../lib/output.ts";
import { leafInfo } from "../match/review-lib.ts";
import { buildBase, scoreWindow, TIERS, type Price } from "./lib.ts";

const ROOT = process.cwd();
const OUT = join(ROOT, "dist/stores");
const read = (file: string, hint: string): Record<string, string>[] => {
  const path = join(ROOT, file);
  if (!existsSync(path)) {
    console.error(`${file} is missing. ${hint}`);
    process.exit(1);
  }
  return parse(readFileSync(path, "utf8"), { columns: true });
};

const { storeTypes } = loadCatalog(ROOT);
const liquor = storeTypes.find((s) => s.resolved.def.store_type === "liquor");
if (!liquor) throw new Error("store type liquor not found");
const leaves = leafInfo(buildCatalogJson(liquor.resolved, summarizeMatches(liquor.matches, liquor.resolved)).departments);
const approved = read("data/matches/liquor.csv", "")
  .filter((r) => r.status === "approved")
  .map((r) => ({ node_id: r.node_id!, sku: r.mercaso_sku!, title: r.title ?? "", case_pack: r.case_pack ?? "", share_12m: Number(r.share_12m) || 0 }));
const hint = "Run pnpm athena:export liquor-stores liquor-store-skus.";
const storeRows = read("data/raw/liquor_stores.csv", hint);
const skuRows = read("data/raw/liquor_store_skus.csv", hint);
const prices = existsSync(join(ROOT, "data/raw/pricing.csv"))
  ? new Map<string, Price>(
      read("data/raw/pricing.csv", "").map((r) => {
        const price = Number(r.price);
        const cost = r.average_cost === "" ? undefined : Number(r.average_cost);
        return [r.sku_number!, { price, promo: r.price_type === "PROMO", ...(cost !== undefined && price > 0 ? { margin: (price - cost) / price } : {}) }];
      }),
    )
  : null;

const base = buildBase({
  asOf: storeRows[0]?.as_of ?? new Date().toISOString().slice(0, 10),
  storeType: "liquor",
  leaves,
  approved,
  stores: storeRows.map((r) => ({
    store_id: r.store_id!,
    store_number: r.store_number ?? "",
    store_name: r.store_name ?? "",
    organization_name: r.organization_name ?? "",
    city: r.city ?? "",
    postal_code: r.postal_code ?? "",
    first_order_date: r.first_order_date ?? "",
    last_order_date: r.last_order_date ?? "",
    orders_12m: Number(r.orders_12m) || 0,
    orders_90d: Number(r.orders_90d) || 0,
    orders_prev_90d: Number(r.orders_prev_90d) || 0,
    spend_12m: Number(r.spend_12m) || 0,
  })),
  storeSkus: skuRows.map((r) => ({ store_id: r.store_id!, sku: r.sku!, cases: Number(r.cases) || 0, last_order_date: r.last_order_date ?? "" })),
  prices,
  holds: liquor.resolved.def.supply_hold ?? {},
});
const file = scoreWindow(base, base.default_window_days);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "liquor.json"), JSON.stringify(base));

const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) : "");
const T = file.totals;
writeFileSync(
  join(OUT, "liquor-stores.csv"),
  toCsv([
    ["store_id", "store_number", "store", "organization", "city", "zip", "status", "days_since_order", "order_tier", "orders_12m", "orders_90d", "orders_prev_90d", "trend", "spend_12m", "catalog_score", "must_pct", "should_pct", "nice_pct", "must_vs_peers_pts", "must_voids", "should_voids", "fading_items", "top_must_voids", "est_opportunity_yr", ...file.departments.map((d) => `dept_${d}`)],
    ...file.stores.map((s) => [
      s.id, s.number, s.name, s.organization, s.city, s.zip, s.status, String(s.days_since_order), TIERS[s.tier]!.key,
      String(s.orders_12m), String(s.orders_90d), String(s.orders_prev_90d), s.trend, s.spend_12m.toFixed(2), s.score.toFixed(1),
      pct(s.must, T.must), pct(s.should, T.should), pct(s.nice, T.nice), s.vs_peers.toFixed(1),
      String(s.voids.must), String(s.voids.should), String(s.fading),
      s.top_voids.map((i) => file.items[i]!.item).join(" | "), String(s.opportunity),
      ...s.departments.map((x) => (x * 100).toFixed(1)),
    ]),
  ]),
);

const voidRows: string[][] = [["store_id", "store", "status", "order_tier", "department", "catalog_item", "priority", "void_type", "days_since_bought", "recommended_sku", "product", "case_pack", "peer_adoption_pct", "typical_peer_cases_yr", "price_no_crv", "promo", "margin_pct", "est_revenue_yr"]];
const VOIDS_PER_STORE = 30;
for (const s of file.stores) {
  const recent = new Set(s.bought);
  const fading = new Map(s.fading_items);
  const top = file.items
    .map((it, i) => ({ it, i, t: it.tiers[s.tier]! }))
    .filter(({ it, i, t }) => !recent.has(i) && !it.hold && it.priority !== "nice" && t.adoption > 0)
    .sort((a, b) => b.t.adoption - a.t.adoption || (b.it.price ?? 0) * b.t.typical_cases - (a.it.price ?? 0) * a.t.typical_cases)
    .slice(0, VOIDS_PER_STORE);
  top.forEach(({ it, i, t }) => {
    const ago = fading.get(i);
    voidRows.push([
      s.id, s.name, s.status, TIERS[s.tier]!.key, it.department, it.item, it.priority,
      ago === undefined ? "not bought 12 mo" : "fading", ago === undefined ? "" : String(ago),
      it.sku, it.title, it.case_pack, (t.adoption * 100).toFixed(1), String(t.typical_cases),
      it.price?.toFixed(2) ?? "", it.price === undefined ? "" : it.promo ? "yes" : "no",
      it.margin === undefined ? "" : (it.margin * 100).toFixed(1),
      it.price === undefined ? "" : String(Math.round(t.adoption * t.typical_cases * it.price)),
    ]);
  });
}
writeFileSync(join(OUT, "liquor-voids.csv"), toCsv(voidRows));

const active = file.stores.filter((s) => s.status === "Active").length;
const kb = (f: string) => `${Math.round(readFileSync(join(OUT, f)).length / 1024)} KB`;
const heldItems = file.items.filter((i) => i.hold).length;
if (heldItems) console.log(`${heldItems} items on supply hold: left out of fading, voids and opportunity.`);
console.log(`${file.stores.length} stores (${active} active in ${file.active_days} days), ${file.items.length} catalog items with a Mercaso SKU; as of ${file.as_of}.`);
console.log(`Scored for a ${file.window_days}-day carried window (the site lets the viewer change it).`);
console.log(`Median must coverage by tier ${file.tiers.map((t, i) => `${t}: ${(file.tier_median_must[i]! * 100).toFixed(0)}%`).join(", ")}.`);
console.log(`wrote dist/stores/liquor.json (${kb("liquor.json")}), liquor-stores.csv, liquor-voids.csv (${voidRows.length - 1} rows)${prices ? "" : "; no pricing.csv, so no revenue estimates"}.`);
