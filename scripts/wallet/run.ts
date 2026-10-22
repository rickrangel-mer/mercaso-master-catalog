/**
 * Wallet view base file (docs/exploration/wallet.md). Reads data/raw/wallet_stores.csv,
 * wallet_store_dept.csv, wallet_store_skus.csv, pricing.csv and lift_adopters.csv
 * (`pnpm athena:export pricing wallet-stores wallet-store-dept wallet-store-skus lift-adopters`) and
 * writes dist/wallet.json (gitignored: it holds spend, prices and costs), which the site's Wallet
 * tab loads and re-scores in the browser (apps/web/lib/wallet.ts). Prints the default view.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { computeWallet, DEFAULT_SETTINGS, type WalletBase, type WalletItem, type WalletSegment, type WalletStore } from "../../apps/web/lib/wallet.ts";
import { loadCatalog } from "../lib/load.ts";
import { summarizeMatches } from "../lib/matches.ts";
import { buildCatalogJson } from "../lib/output.ts";
import { backtestRows, buildModel, incrementalityFor, incrementalityOf, realizationOf, type Catalog } from "../lift/lib.ts";
import { leafInfo } from "../match/review-lib.ts";
import { TIERS, tierOf } from "../stores/lib.ts";
import { marginRate } from "../growth/lib.ts";

const ROOT = process.cwd();
const TYPE_CATALOG: Record<string, string> = {
  "Liquor store": "liquor",
  Laundromat: "laundromat",
  "Market / grocery": "liquor",
  "Gas station": "liquor",
  "Convenience store": "liquor",
  "Smoke shop": "liquor",
  "Discount dollar": "liquor",
  "": "liquor",
};
/** Display groups, bottom of the stack first. */
const GROUPS = ["Beverage", "Candy & snacks", "Tobacco", "Grocery", "Cleaning & household", "Health & beauty", "Other"];
const OTHER = GROUPS.length - 1;
/** Catalog department key -> group. */
const CATALOG_GROUP: Record<string, number> = { scd: 0, drinks: 0, "candy-snacks": 1, tobacco: 2, grocery: 3, household: 4, laundry: 4, "mixers-bar": 4, "health-beauty": 5 };
/** Mercaso department -> group; anything else is Other. */
const MERCASO_GROUP: Record<string, number> = {
  Beverage: 0,
  "Candy & Snacks": 1,
  Tobacco: 2,
  Grocery: 3,
  Frozen: 3,
  "Cleaning & Laundry": 4,
  "Household & Kitchen": 4,
  "Store Supplies": 4,
  "Restaurants & Bars": 4,
  "Health & Beauty": 5,
  Baby: 5,
};
/** Item history kept per snapshot; the item window input goes up to this. */
const MAX_ITEM_DAYS = 180;

const read = (file: string): Record<string, string>[] => {
  const path = join(ROOT, file);
  if (!existsSync(path)) {
    console.error(`${file} is missing. Run pnpm athena:export pricing wallet-stores wallet-store-dept wallet-store-skus lift-adopters.`);
    process.exit(1);
  }
  return parse(readFileSync(path, "utf8"), { columns: true });
};
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

// Catalogs, as in `pnpm lift`.
const { storeTypes } = loadCatalog(ROOT);
const catalogs: Catalog[] = [...new Set(Object.values(TYPE_CATALOG))].map((key) => {
  const st = storeTypes.find((s) => s.resolved.def.store_type === key)!;
  return {
    key,
    leaves: leafInfo(buildCatalogJson(st.resolved, summarizeMatches(st.matches, st.resolved)).departments),
    approved: st.matches
      .filter((m) => m.status === "approved")
      .map((m) => ({ node_id: m.node_id, sku: m.mercaso_sku, case_pack: Math.max(1, m.case_pack ?? 1), share_12m: m.share_12m ?? 0 })),
    holds: st.resolved.def.supply_hold ?? {},
  };
});

const storeRows = read("data/raw/wallet_stores.csv");
const asOf = storeRows[0]?.as_of ?? new Date().toISOString().slice(0, 10);
const thenAsOf = new Date(Date.parse(asOf) - 365 * 86_400_000).toISOString().slice(0, 10);
const skuRows = read("data/raw/wallet_store_skus.csv");
const prices = new Map(
  read("data/raw/pricing.csv").map((r) => [r.sku_number!, { price: Number(r.price) || 0, ...(r.average_cost === "" ? {} : { cost: Number(r.average_cost) }) }]),
);

// Per-item values per segment (store type × tier), from today's active stores' 12 months.
const model = buildModel({
  asOf,
  catalogs,
  typeCatalog: TYPE_CATALOG,
  stores: storeRows.map((r) => ({ id: r.store_id!, type: r.store_type ?? "", number: "", name: "", city: "", last_order_date: r.last_order_now ?? "", orders_12m: Number(r.orders_12m_now) || 0 })),
  storeSkus: skuRows.filter((r) => r.last_now).map((r) => ({ store_id: r.store_id!, sku: r.sku!, cases: Number(r.cases_12m) || 0, last_order_date: r.last_now! })),
  prices,
});
const inc = incrementalityOf(model);
const realization = realizationOf(
  backtestRows(
    model,
    TYPE_CATALOG,
    read("data/raw/lift_adopters.csv").map((r) => ({ store_id: r.store_id!, item: r.item!, item_after: Number(r.item_after) || 0 })),
  ),
);

const walletCatalogs: Record<string, WalletItem[]> = {};
for (const [key, items] of model.catalogs) {
  walletCatalogs[key] = items.map((it) => ({
    name: it.item,
    group: CATALOG_GROUP[it.id.split(".")[0]!] ?? OTHER,
    priority: it.priority,
    incrementality: incrementalityFor(inc, it.department),
  }));
}
const segments: WalletSegment[] = model.groups.map((g) => {
  const items = model.catalogs.get(g.catalog)!;
  return {
    key: g.key,
    type: g.type,
    tier: g.tier,
    catalog: g.catalog,
    revenue: g.items.map((gi) => {
      const it = items[gi.item]!;
      return it.hold || it.unitPrice === undefined ? 0 : Math.round(gi.typical * it.unitPrice * 100) / 100;
    }),
    profit: g.items.map((gi) => {
      const it = items[gi.item]!;
      return it.hold || it.unitPrice === undefined || it.unitCost === undefined ? 0 : Math.round(gi.typical * (it.unitPrice - it.unitCost) * 100) / 100;
    }),
  };
});
const segmentIndex = new Map(model.groups.map((g, i) => [g.key, i]));

// SKU -> item indexes per catalog.
const skuItems = new Map<string, Map<string, number[]>>();
for (const c of catalogs) {
  const index = new Map(model.catalogs.get(c.key)!.map((it, i) => [it.id, i]));
  const m = new Map<string, number[]>();
  for (const a of c.approved) {
    const i = index.get(a.node_id);
    if (i === undefined) continue;
    const list = m.get(a.sku) ?? [];
    list.push(i);
    m.set(a.sku, list);
  }
  skuItems.set(c.key, m);
}

// Stores.
const typeOf = new Map(storeRows.map((r) => [r.store_id!, r.store_type ?? ""]));
const bySku = new Map<string, { now: Map<number, number>; then: Map<number, number>; cases: Map<string, number> }>();
for (const r of skuRows) {
  const type = typeOf.get(r.store_id!);
  if (type === undefined) continue;
  const items = skuItems.get(TYPE_CATALOG[type]!)!.get(r.sku!);
  let e = bySku.get(r.store_id!);
  if (!e) bySku.set(r.store_id!, (e = { now: new Map(), then: new Map(), cases: new Map() }));
  e.cases.set(r.sku!, (e.cases.get(r.sku!) ?? 0) + (Number(r.cases_12m) || 0));
  if (!items) continue;
  for (const i of items) {
    if (r.last_now) {
      const d = days(r.last_now, asOf);
      if (d <= MAX_ITEM_DAYS) e.now.set(i, Math.min(d, e.now.get(i) ?? Infinity));
    }
    if (r.last_then) {
      const d = days(r.last_then, thenAsOf);
      if (d <= MAX_ITEM_DAYS) e.then.set(i, Math.min(d, e.then.get(i) ?? Infinity));
    }
  }
}
const spend = new Map<string, { now: number[]; then: number[] }>();
for (const r of read("data/raw/wallet_store_dept.csv")) {
  let e = spend.get(r.store_id!);
  if (!e) spend.set(r.store_id!, (e = { now: GROUPS.map(() => 0), then: GROUPS.map(() => 0) }));
  const g = MERCASO_GROUP[r.department ?? ""] ?? OTHER;
  (r.win === "now" ? e.now : e.then)[g]! += Number(r.spend) || 0;
}
const stores: WalletStore[] = [];
for (const r of storeRows) {
  const type = r.store_type ?? "";
  const catalog = TYPE_CATALOG[type];
  if (catalog === undefined) continue;
  const tierNow = tierOf(Number(r.orders_12m_now) || 0);
  const segment = segmentIndex.get(`${type}|${tierNow}`) ?? segmentIndex.get(`${type}|all`);
  if (segment === undefined) continue; // a store type with no active store today
  // Only stores that could count as active at either anchor (the active-days input goes up to 180).
  const lastNow = r.last_order_now ? days(r.last_order_now, asOf) : -1;
  const lastThen = r.last_order_then ? days(r.last_order_then, thenAsOf) : -1;
  if (!(lastNow >= 0 && lastNow <= MAX_ITEM_DAYS) && !(lastThen >= 0 && lastThen <= MAX_ITEM_DAYS)) continue;
  const e = bySku.get(r.store_id!);
  const sp = spend.get(r.store_id!);
  const round2 = (x: number) => Math.round(x);
  stores.push({
    type,
    segment,
    tierNow,
    tierThen: tierOf(Number(r.orders_12m_then) || 0),
    catalog,
    lastNow,
    lastThen,
    ordersNow: Number(r.orders_90_now) || 0,
    ordersThen: Number(r.orders_90_then) || 0,
    spendNow: (sp?.now ?? GROUPS.map(() => 0)).map(round2),
    spendThen: (sp?.then ?? GROUPS.map(() => 0)).map(round2),
    itemsNow: [...(e?.now ?? [])].sort((a, b) => a[0] - b[0]).flat(),
    itemsThen: [...(e?.then ?? [])].sort((a, b) => a[0] - b[0]).flat(),
  });
}

// Gross margin per group: today's prices and costs on what covered stores bought from the catalogs.
const marginRows = GROUPS.map(() => [] as { cases: number; price?: number; cost?: number }[]);
const all: { cases: number; price?: number; cost?: number }[] = [];
for (const [storeId, e] of bySku) {
  const catalog = TYPE_CATALOG[typeOf.get(storeId)!]!;
  const items = model.catalogs.get(catalog)!;
  for (const [sku, cases] of e.cases) {
    const list = skuItems.get(catalog)!.get(sku);
    const p = prices.get(sku);
    if (!list || !p) continue;
    const row = { cases, price: p.price, ...(p.cost !== undefined ? { cost: p.cost } : {}) };
    marginRows[CATALOG_GROUP[items[list[0]!]!.id.split(".")[0]!] ?? OTHER]!.push(row);
    all.push(row);
  }
}
const overall = marginRate(all) ?? 0.13;
const margins = marginRows.map((rows) => Math.round((marginRate(rows) ?? overall) * 10000) / 10000);

const base: WalletBase = {
  schema_version: 1,
  as_of: asOf,
  then_as_of: thenAsOf,
  groups: GROUPS,
  catalogs: walletCatalogs,
  segments,
  stores,
  tiers: TIERS.map((t) => t.key),
  margins,
  realization,
};
mkdirSync(join(ROOT, "dist"), { recursive: true });
const json = JSON.stringify(base);
// dist/wallet.json would be picked up as a catalog by the site's copy-data, so it lives in its own folder.
mkdirSync(join(ROOT, "dist/wallet"), { recursive: true });
writeFileSync(join(ROOT, "dist/wallet/wallet.json"), json);

// Default view, as a check.
const r = computeWallet(base, { ...DEFAULT_SETTINGS, shortTerm: GROUPS.map(() => null), longTerm: GROUPS.map(() => null) });
const k = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const p = (x: number) => (Number.isNaN(x) ? "–" : `${(x * 100).toFixed(1)}%`);
console.log(`Wallet base: ${stores.length} stores, ${segments.length} segments, ${(json.length / 1e6).toFixed(1)} MB; as of ${asOf} (then ${thenAsOf}); realization ${realization.toFixed(2)}.`);
for (const [name, s] of [["12 months ago", r.then], ["Today", r.today], ["Short term", r.shortTerm], ["Long term", r.longTerm]] as const) {
  console.log(`${name.padEnd(14)} stores ${s.stores}  AOV ${k(s.aov.reduce((a, b) => a + b, 0))}  revenue/yr ${k(s.revenue)}  profit/yr ${k(s.profit)}  | ${GROUPS.map((g, i) => `${g} ${k(s.aov[i]!)}`).join(", ")}`);
}
for (const [i, g] of r.groups.entries()) {
  if (i === OTHER) continue;
  console.log(`${GROUPS[i]!.padEnd(22)} then ${p(g.then)}  today ${p(g.today)}  best ${p(g.best)}  ST ${p(g.shortTerm)}  LT ${p(g.longTerm)}  +1pt ${k(g.revenuePerPoint)}  items ${g.itemsPerStore.toFixed(0)}`);
}
