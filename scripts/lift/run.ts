/**
 * Penetration lift for active stores (docs/exploration/penetration-lift.md). Reads
 * data/raw/lift_stores.csv, lift_store_skus.csv, lift_adopters.csv and pricing.csv
 * (`pnpm athena:export pricing lift-stores lift-store-skus lift-adopters`). Writes, all under the
 * gitignored dist/lift/:
 *   summary.md   yearly lift per scenario (expected, with a low–high range), by store type,
 *                department and priority, and the back-test behind it
 *   items.csv    per catalog item and store type: penetration today and per scenario, extra stores,
 *                expected revenue and margin (the push list)
 *   stores.csv   per active store: expected lift per scenario and its top gaps
 * Prices, costs, revenue and store names stay out of git.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { toCsv } from "../athena/lib.ts";
import { loadCatalog } from "../lib/load.ts";
import { summarizeMatches } from "../lib/matches.ts";
import { buildCatalogJson } from "../lib/output.ts";
import { leafInfo } from "../match/review-lib.ts";
import { withoutContact } from "../stores/lib.ts";
import {
  backtestRows,
  buildModel,
  expected,
  incrementalityFor,
  incrementalityOf,
  isActive,
  liftRows,
  MIN_CATEGORY_STORES,
  LOW_INCREMENTALITY,
  range,
  realizationHigh,
  realizationOf,
  SCENARIOS,
  storeLift,
  TIERS,
  typeName,
  type Catalog,
  type LiftRow,
  type Scenario,
} from "./lib.ts";

const ROOT = process.cwd();
const OUT = join(ROOT, "dist/lift");
/** Which catalog each covered store type is measured against; "" is "no type set". */
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
const SCENARIO_NAMES: Record<Scenario, string> = {
  catch_up: "Catch up to peers",
  plus_5: "+5 points",
  plus_10: "+10 points",
};

const read = (file: string, hint: string): Record<string, string>[] => {
  const path = join(ROOT, file);
  if (!existsSync(path)) {
    console.error(`${file} is missing. ${hint}`);
    process.exit(1);
  }
  return parse(readFileSync(path, "utf8"), { columns: true });
};
const hint = "Run pnpm athena:export pricing lift-stores lift-store-skus lift-adopters.";

const { storeTypes } = loadCatalog(ROOT);
const catalogs: Catalog[] = [...new Set(Object.values(TYPE_CATALOG))].map((key) => {
  const st = storeTypes.find((s) => s.resolved.def.store_type === key);
  if (!st) throw new Error(`store type ${key} not found`);
  return {
    key,
    leaves: leafInfo(buildCatalogJson(st.resolved, summarizeMatches(st.matches, st.resolved)).departments),
    approved: st.matches
      .filter((m) => m.status === "approved")
      .map((m) => ({ node_id: m.node_id, sku: m.mercaso_sku, case_pack: Math.max(1, m.case_pack ?? 1), share_12m: m.share_12m ?? 0 })),
    holds: st.resolved.def.supply_hold ?? {},
  };
});

const storeRows = read("data/raw/lift_stores.csv", hint);
const asOf = storeRows[0]?.as_of ?? new Date().toISOString().slice(0, 10);
const stores = storeRows.map((r) => ({
  id: r.store_id!,
  type: r.store_type ?? "",
  number: r.store_number ?? "",
  name: withoutContact(r.store_name ?? ""),
  city: r.city ?? "",
  last_order_date: r.last_order_date ?? "",
  orders_12m: Number(r.orders_12m) || 0,
}));
const prices = new Map(
  read("data/raw/pricing.csv", hint).map((r) => [
    r.sku_number!,
    { price: Number(r.price) || 0, ...(r.average_cost === "" ? {} : { cost: Number(r.average_cost) }) },
  ]),
);
const model = buildModel({
  asOf,
  catalogs,
  typeCatalog: TYPE_CATALOG,
  stores,
  storeSkus: read("data/raw/lift_store_skus.csv", hint).map((r) => ({
    store_id: r.store_id!,
    sku: r.sku!,
    cases: Number(r.cases) || 0,
    last_order_date: r.last_order_date ?? "",
  })),
  prices,
});
const backtest = backtestRows(
  model,
  TYPE_CATALOG,
  read("data/raw/lift_adopters.csv", hint).map((r) => ({
    store_id: r.store_id!,
    item: r.item!,
    item_after: Number(r.item_after) || 0,
  })),
);
const realization = realizationOf(backtest);
const inc = incrementalityOf(model);

const itemOf = (r: { catalog: string; item: number }) => model.catalogs.get(r.catalog)![r.item]!;
const lifts = Object.fromEntries(SCENARIOS.map((s) => [s, liftRows(model, s)])) as Record<Scenario, LiftRow[]>;
const factorOf = (r: LiftRow) => realization * incrementalityFor(inc, itemOf(r).department);
const gross = (rows: LiftRow[], what: "revenue" | "margin") => rows.map((r) => ({ department: itemOf(r).department, value: r[what] }));

// --- items.csv ---
const pct = (x: number) => (x * 100).toFixed(1);
const usd = (x: number) => x.toFixed(0);
const itemRows = lifts.catch_up
  .map((r, i) => ({ r, i }))
  .filter(({ r }) => r.stores > 0)
  .sort((a, b) => b.r.margin * factorOf(b.r) - a.r.margin * factorOf(a.r));
mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, "items.csv"),
  toCsv([
    ["store_type", "catalog", "department", "catalog_item", "priority", "supply_hold", "recommended_sku", "active_stores", "buying_now", "penetration_pct", ...SCENARIOS.flatMap((s) => [`${s}_target_pct`, `${s}_extra_stores`, `${s}_revenue_yr`, `${s}_margin_yr`]), "node_id"],
    ...itemRows.map(({ r, i }) => {
      const it = itemOf(r);
      const f = factorOf(r);
      return [
        typeName(r.type), r.catalog, it.department, it.item, it.priority, it.hold ? "yes" : "", it.sku ?? "",
        String(r.stores), String(r.buyers), pct(r.buyers / r.stores),
        ...SCENARIOS.flatMap((s) => {
          const x = lifts[s][i]!;
          return [pct((x.buyers + x.extra) / x.stores), x.extra.toFixed(1), usd(x.revenue * f), usd(x.margin * f)];
        }),
        it.id,
      ];
    }),
  ]),
);

// --- stores.csv ---
const perStore = Object.fromEntries(SCENARIOS.map((s) => [s, new Map(storeLift(model, s).map((x) => [x.store, x]))])) as Record<Scenario, Map<number, ReturnType<typeof storeLift>[number]>>;
const storeFactor = (k: number) => {
  const g = model.groups[model.storeGroup.get(k)!]!;
  const items = model.catalogs.get(g.catalog)!;
  return (item: number) => realization * incrementalityFor(inc, items[item]!.department);
};
const storeOut = [...model.storeGroup.keys()].map((k) => {
  const f = storeFactor(k);
  const val = (s: Scenario, what: "revenue" | "margin") => {
    const x = perStore[s].get(k)!;
    // Expected = each gap's gross value × its department's factor; margin scales the same way.
    const rev = x.gaps.reduce((a, [i, v]) => a + v * f(i), 0);
    return what === "revenue" ? rev : x.revenue > 0 ? (x.margin * rev) / x.revenue : 0;
  };
  return { k, val };
});
storeOut.sort((a, b) => b.val("catch_up", "margin") - a.val("catch_up", "margin"));
writeFileSync(
  join(OUT, "stores.csv"),
  toCsv([
    ["store_id", "store_number", "store", "city", "store_type", "order_tier", "orders_12m", "last_order_date", ...SCENARIOS.flatMap((s) => [`${s}_revenue_yr`, `${s}_margin_yr`]), "top_gaps"],
    ...storeOut.map(({ k, val }) => {
      const s = model.stores[k]!;
      const g = model.groups[model.storeGroup.get(k)!]!;
      const items = model.catalogs.get(g.catalog)!;
      return [
        s.id, s.number, s.name, s.city, typeName(s.type), TIERS[Math.max(0, TIERS.findIndex((t) => s.orders_12m >= t.min && s.orders_12m <= t.max))]!.key,
        String(s.orders_12m), s.last_order_date,
        ...SCENARIOS.flatMap((sc) => [usd(val(sc, "revenue")), usd(val(sc, "margin"))]),
        perStore.catch_up.get(k)!.gaps.slice(0, 5).map(([i]) => items[i]!.item).join(" | "),
      ];
    }),
  ]),
);

// --- summary.md ---
const money = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const short = (x: number) => (Math.abs(x) >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : `$${Math.round(x / 1000).toLocaleString("en-US")}K`);
const sumBy = (rows: LiftRow[], key: (r: LiftRow) => string) => {
  const m = new Map<string, LiftRow[]>();
  for (const r of rows) {
    const list = m.get(key(r)) ?? [];
    list.push(r);
    m.set(key(r), list);
  }
  return m;
};
const exp = (rows: LiftRow[], what: "revenue" | "margin") => expected(gross(rows, what), realization, inc);
const rng = (rows: LiftRow[], what: "revenue" | "margin") => range(gross(rows, what), backtest, inc);
const activeAll = stores.filter((s) => isActive(s, asOf));
const covered = activeAll.filter((s) => TYPE_CATALOG[s.type] !== undefined);
const notCovered = new Map<string, number>();
for (const s of activeAll) if (TYPE_CATALOG[s.type] === undefined) notCovered.set(typeName(s.type), (notCovered.get(typeName(s.type)) ?? 0) + 1);

const headline = SCENARIOS.map((s) => {
  const rows = lifts[s];
  const [ml, mh] = rng(rows, "margin");
  const [rl, rh] = rng(rows, "revenue");
  const extra = rows.reduce((a, r) => a + r.extra, 0);
  return `| ${SCENARIO_NAMES[s]} | **${short(exp(rows, "margin"))}** (${short(ml)}–${short(mh)}) | ${short(exp(rows, "revenue"))} (${short(rl)}–${short(rh)}) | ${Math.round(extra).toLocaleString("en-US")} | ${short(rows.reduce((a, r) => a + r.margin, 0))} |`;
}).join("\n");

const table = (title: string, key: (r: LiftRow) => string, order?: string[]) => {
  const groups = sumBy(lifts.catch_up, key);
  const keys = order ?? [...groups.keys()].sort((a, b) => exp(groups.get(b)!, "margin") - exp(groups.get(a)!, "margin"));
  const lines = keys
    .filter((k) => groups.has(k))
    .map((k) => {
      const rows = groups.get(k)!;
      const extra = rows.reduce((a, r) => a + r.extra, 0);
      return `| ${k} | ${short(exp(rows, "margin"))} | ${short(exp(rows, "revenue"))} | ${Math.round(extra).toLocaleString("en-US")} |`;
    });
  return `| ${title} | Margin a year | Revenue a year | Extra store × items |\n|---|---|---|---|\n${lines.join("\n")}`;
};
const storesByType = new Map<string, number>();
for (const s of covered) storesByType.set(typeName(s.type), (storesByType.get(typeName(s.type)) ?? 0) + 1);
const typeTable = (() => {
  const groups = sumBy(lifts.catch_up, (r) => typeName(r.type));
  const keys = [...groups.keys()].sort((a, b) => exp(groups.get(b)!, "margin") - exp(groups.get(a)!, "margin"));
  return `| Store type | Active stores | Catalog | Margin a year | Revenue a year | Margin per store |\n|---|---|---|---|---|---|\n${keys
    .map((k) => {
      const rows = groups.get(k)!;
      const n = storesByType.get(k) ?? 0;
      const m = exp(rows, "margin");
      return `| ${k} | ${n.toLocaleString("en-US")} | ${rows[0]!.catalog} | ${short(m)} | ${short(exp(rows, "revenue"))} | ${money(n ? m / n : 0)} |`;
    })
    .join("\n")}`;
})();
const depts = [...inc.raw.keys()].sort();
const topItems = itemRows.slice(0, 15).map(({ r }) => {
  const it = itemOf(r);
  return `| ${typeName(r.type)} | ${it.item} | ${it.priority} | ${pct(r.buyers / r.stores)}% → ${pct((r.buyers + r.extra) / r.stores)}% | ${Math.round(r.extra)} | ${short(r.margin * factorOf(r))} |`;
});
const noPrice = [...model.catalogs.values()].flat().filter((it) => it.unitPrice === undefined).length;

const summary = `# Penetration lift — active stores (${asOf})

Yearly Mercaso sales gained if active stores (ordered in the last ${45} days) buy the catalog items their peers buy. Method and decisions: \`docs/exploration/penetration-lift.md\`. Expected = gross × realization × incrementality from the back-test; the low and high cases are explained under Back-test. Full-year run rate once stores convert; Mercaso sales only.

## Headline

| Scenario | Margin a year (range) | Revenue a year (range) | Extra store × items | Gross margin before the back-test |
|---|---|---|---|---|
${headline}

**Catch up to peers** brings each item, in each store type and order tier, to the penetration of that group's best-assorted quarter of stores. The flat scenarios add 5 or 10 points to items at least one store in the group buys.

${covered.length.toLocaleString("en-US")} active stores covered. Not covered (no catalog fits): ${[...notCovered].map(([t, n]) => `${t} ${n}`).join(", ")}.

## By store type (catch up to peers)

${typeTable}

## By department (catch up to peers)

${table("Department", (r) => `${itemOf(r).department}${r.catalog === "laundromat" ? " (laundromats)" : ""}`)}

## By priority (catch up to peers)

${table("Priority", (r) => itemOf(r).priority, ["must", "should", "nice"])}

## Top items (catch up to peers, expected margin)

| Store type | Item | Priority | Penetration today → target | Extra stores | Margin a year |
|---|---|---|---|---|---|
${topItems.join("\n")}

The full list is \`items.csv\`; per store, \`stores.csv\`.

## Back-test

**Realization ${realization.toFixed(2)}.** ${backtest.length.toLocaleString("en-US")} adopters: a covered store that first bought a catalog item 365–545 days ago after ordering for at least 90 days. In its first full year the median adopter bought ${realization.toFixed(2)}× the typical yearly volume the model uses (the middle half: 0.5× to 2×), so the expected lift uses the volumes as they are. Orders are lumpy (a quarter of adopters bought exactly the typical volume), so the range is set by assumptions instead of resampling: **low** keeps the median adopter and lets every department substitute at least as much as drinks (incrementality capped at ${LOW_INCREMENTALITY * 100}%); **high** uses the mean adopter, heavy buyers capped at twice the typical volume (${realizationHigh(backtest).toFixed(2)}×).

**Incrementality ${(inc.overall * 100).toFixed(0)}% overall.** How much of a new item's volume is new to Mercaso rather than taken from the category's other items. Measured across active stores: within each catalog category (${MIN_CATEGORY_STORES}+ stores), how many more units a store buys per extra item it carries, holding its size equal, over the category's average units per item. Capped at 100%: above 1 means stores with broader assortments also sell more per item, which says more about the stores than about the items.

| Department | Measured ratio | Used |
|---|---|---|
${depts.map((d) => `| ${d} | ${inc.raw.get(d)!.toFixed(2)} | ${(incrementalityFor(inc, d) * 100).toFixed(0)}% |`).join("\n")}

An adopter before/after check (category volume before and after a store adds an item) was tried first and dropped: adopting stores were already growing the category (+40% against +20% for the store overall), so it could not separate substitution from growth.

## Caveats

- Mercaso sales only: a store may already buy the item from another supplier.
- Run rate: a full year once stores convert, not first-year revenue.
- Markets, smoke shops and dollar stores are measured against the liquor catalog, which lacks their deeper grocery and tobacco range, so their lift is understated.
- ${noPrice} catalog items have no price in the pricing export (mostly archived SKUs) and add nothing.
- Items on supply hold (Arizona) add nothing.
`;
writeFileSync(join(OUT, "summary.md"), summary);
console.log(summary);
console.log(`wrote dist/lift/summary.md, items.csv (${itemRows.length} rows), stores.csv (${storeOut.length} rows)`);
