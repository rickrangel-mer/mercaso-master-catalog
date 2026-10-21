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
  target,
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

const PLAIN_SCENARIO: Record<Scenario, string> = {
  catch_up: "Do as well as the best stores",
  plus_5: "5 more stores out of every 100",
  plus_10: "10 more stores out of every 100",
};
const headline = SCENARIOS.map((s) => {
  const rows = lifts[s];
  const [ml, mh] = rng(rows, "margin");
  const [rl, rh] = rng(rows, "revenue");
  const extra = rows.reduce((a, r) => a + r.extra, 0);
  return `| ${PLAIN_SCENARIO[s]} | **${short(exp(rows, "margin"))}** (${short(ml)} to ${short(mh)}) | ${short(exp(rows, "revenue"))} (${short(rl)} to ${short(rh)}) | ${Math.round(extra).toLocaleString("en-US")} |`;
}).join("\n");
const catchUp = lifts.catch_up;
const mainProfit = exp(catchUp, "margin");
const [mainLow, mainHigh] = rng(catchUp, "margin");

const table = (title: string, key: (r: LiftRow) => string, order?: string[]) => {
  const groups = sumBy(catchUp, key);
  const keys = order ?? [...groups.keys()].sort((a, b) => exp(groups.get(b)!, "margin") - exp(groups.get(a)!, "margin"));
  const lines = keys
    .filter((k) => groups.has(k))
    .map((k) => {
      const rows = groups.get(k)!;
      const extra = rows.reduce((a, r) => a + r.extra, 0);
      return `| ${k} | ${short(exp(rows, "margin"))} | ${short(exp(rows, "revenue"))} | ${Math.round(extra).toLocaleString("en-US")} |`;
    });
  return `| ${title} | Extra profit a year | Extra sales a year | New "store starts buying an item" |\n|---|---|---|---|\n${lines.join("\n")}`;
};
const storesByType = new Map<string, number>();
for (const s of covered) storesByType.set(typeName(s.type), (storesByType.get(typeName(s.type)) ?? 0) + 1);
const typeTable = (() => {
  const groups = sumBy(catchUp, (r) => typeName(r.type));
  const keys = [...groups.keys()].sort((a, b) => exp(groups.get(b)!, "margin") - exp(groups.get(a)!, "margin"));
  return `| Store type | Active stores | Extra profit a year | Extra sales a year | Extra profit per store |\n|---|---|---|---|---|\n${keys
    .map((k) => {
      const rows = groups.get(k)!;
      const n = storesByType.get(k) ?? 0;
      const m = exp(rows, "margin");
      return `| ${k} | ${n.toLocaleString("en-US")} | ${short(m)} | ${short(exp(rows, "revenue"))} | ${money(n ? m / n : 0)} |`;
    })
    .join("\n")}`;
})();
const depts = [...inc.raw.keys()].sort((a, b) => incrementalityFor(inc, a) - incrementalityFor(inc, b));
const topItems = itemRows.slice(0, 15).map(({ r }) => {
  const it = itemOf(r);
  return `| ${typeName(r.type)} | ${it.item} | ${it.priority} | ${pct(r.buyers / r.stores)}% → ${pct((r.buyers + r.extra) / r.stores)}% | ${Math.round(r.extra)} | ${short(r.margin * factorOf(r))} |`;
});
const noPrice = [...model.catalogs.values()].flat().filter((it) => it.unitPrice === undefined).length;
const cents = (d: string) => Math.round((1 - incrementalityFor(inc, d)) * 100);
const taken = depts.filter((d) => cents(d) > 0);
/** Short everyday names, for sentences. */
const SHORT_DEPT: Record<string, string> = {
  Laundry: "Laundry products",
  "Water, energy, sports, juice, tea & coffee": "Water, energy drinks, juice and tea",
  "Soft drinks": "Soda",
};
const plural: Record<string, string> = { Restaurant: "restaurants", "Non-store": "non-store accounts", Miscellaneous: "miscellaneous", Hotel: "hotels" };

// A worked example: the single group × item with the most expected profit.
const worked = (() => {
  let best: { g: (typeof model.groups)[number]; gi: (typeof model.groups)[number]["items"][number]; value: number } | undefined;
  for (const g of model.groups) {
    const items = model.catalogs.get(g.catalog)!;
    for (const gi of g.items) {
      const it = items[gi.item]!;
      if (it.hold || it.unitPrice === undefined || it.unitCost === undefined) continue;
      const extra = Math.max(0, target("catch_up", gi) - gi.penetration) * g.stores.length;
      const value = extra * gi.typical * (it.unitPrice - it.unitCost) * realization * incrementalityFor(inc, it.department);
      if (!best || value > best.value) best = { g, gi, value };
    }
  }
  if (!best) return "";
  const { g, gi } = best;
  const it = model.catalogs.get(g.catalog)![gi.item]!;
  const n = g.stores.length;
  const tierText = g.tier >= 0 ? `order ${TIERS[g.tier]!.key} times a year` : "order any number of times a year (a small group, so all are pooled)";
  const buyers = Math.round(gi.penetration * n);
  const top = Math.max(1, Math.ceil(n * 0.25));
  const extra = (target("catch_up", gi) - gi.penetration) * n;
  const unitMargin = it.unitPrice! - it.unitCost!;
  const storeSales = gi.typical * it.unitPrice!;
  const storeProfit = gi.typical * unitMargin;
  const incD = incrementalityFor(inc, it.department);
  const d2 = (x: number) => `$${x.toFixed(2)}`;
  return `### Worked example: ${it.item}, at ${typeName(g.type).toLowerCase()}s that ${tierText}

1. **The group.** ${n.toLocaleString("en-US")} active ${typeName(g.type).toLowerCase()}s that ${tierText}.
2. **Today.** ${buyers.toLocaleString("en-US")} of them bought it in the last 90 days: **${pct(gi.penetration)}%**.
3. **The goal.** We rank the ${n.toLocaleString("en-US")} stores by how much of the catalog they carry and take the best quarter (${top.toLocaleString("en-US")} stores). **${pct(gi.top)}%** of them buy this item, so that is the goal.
4. **Stores that would start.** (${pct(gi.top)}% − ${pct(gi.penetration)}%) × ${n.toLocaleString("en-US")} stores = **${extra.toFixed(0)} stores**.
5. **What one store buys in a year.** The stores in this group that already buy it take a typical (middle) ${gi.typical.toLocaleString("en-US")} units a year. At ${d2(it.unitPrice!)} a unit that is ${money(storeSales)} in sales; we keep ${d2(unitMargin)} a unit, so ${money(storeProfit)} in profit.
6. **Before the reality check.** ${extra.toFixed(0)} stores × ${money(storeProfit)} = **${money(extra * storeProfit)}** profit a year.
7. **The reality check.** × ${realization.toFixed(2)} (new buyers really do buy about that much) × ${(incD * 100).toFixed(0)}% (the part that is truly new, not taken from other items the store already buys from us) = **${money(best.value)}** profit a year.

The report does exactly this for every catalog item in every group of similar stores, then adds it all up.
`;
})();

const summary = `# How much more we could sell to the stores we already have (${asOf})

## The short answer

If our active stores bought the catalog items that the best stores like them already buy, Mercaso would make about **${short(mainProfit)} more profit a year** (somewhere between ${short(mainLow)} and ${short(mainHigh)}), on about **${short(exp(catchUp, "revenue"))} more sales a year**.

"Profit" here means gross margin: sales minus what the products cost us.

## What we looked at

- **Which stores:** the ${covered.length.toLocaleString("en-US")} stores that ordered from us in the last 45 days. Stores that stopped ordering, and stores that never ordered, come in a second report.
- **What they should carry:** our master catalog, the list of items a store of that kind should carry. Laundromats are checked against the laundromat catalog. Liquor stores, gas stations, convenience stores, markets, smoke shops, dollar stores and stores with no type are checked against the liquor catalog, the closest fit we have.
- **Left out:** ${[...notCovered].map(([t, n]) => `${plural[t] ?? t.toLowerCase()} (${n})`).join(", ")}. The catalog isn't built for what they buy.
- **A missing item:** a store that hasn't bought the item from us in the last 90 days.
- **Fair comparisons:** each store is compared only with stores like it: same kind of store, and ordering about as often (1–5, 6–20, 21–50 or more than 50 orders a year). A gas station is never compared with a liquor store.

## Three ways to look at it

| Goal | Extra profit a year (low to high) | Extra sales a year (low to high) | New "store starts buying an item" |
|---|---|---|---|
${headline}

- **Do as well as the best stores** is the main number. For each item, we look at the best quarter of similar stores (the ones that carry the most of the catalog) and ask the others to reach their level. If 80% of the best liquor stores carry Coca-Cola 2L, we aim for 80% of all similar liquor stores.
- **5 or 10 more stores out of every 100** is a simpler goal: for each item, 5 or 10 more stores out of every 100 start buying it. It only counts items that at least some similar stores already buy.

## Which stores

${typeTable}

## Which kinds of products

${table("Department", (r) => `${itemOf(r).department}${r.catalog === "laundromat" ? " (laundromats)" : ""}`)}

## Must, should or nice

${table("Catalog priority", (r) => itemOf(r).priority, ["must", "should", "nice"])}

## The 15 biggest items

| Store type | Item | Priority | Stores buying it now → goal | Stores that would start | Extra profit a year |
|---|---|---|---|---|---|
${topItems.join("\n")}

Every item is in \`items.csv\`. Every store, with the 5 items worth the most to it, is in \`stores.csv\`, so reps can start with the biggest accounts.

## How we did the math

**Step 1: put similar stores together.** Stores are grouped by kind (liquor store, gas station…) and by how often they order (1–5, 6–20, 21–50 or more than 50 times a year). Each store is only compared with its own group. A group with fewer than 20 stores is merged with the rest of its kind.

**Step 2: see who buys each item today.** For every catalog item and every group: how many of the group's stores bought it from us in the last 90 days. Different pack sizes of the same product count as the same item.

**Step 3: set a goal from the best stores.** In each group we rank stores by how much of the catalog they carry (must items count 3, should 2, nice 1) and take the best quarter. The share of those best stores that buy the item is the goal for the whole group. Where the group already beats it, nothing is added.

**Step 4: count the stores that would start buying.** (Goal − today) × number of stores in the group.

**Step 5: put a value on each new buyer.** What a typical store in the group that already buys the item takes in a year (the middle store, so a few huge buyers don't inflate it), counted in units so different pack sizes add up, × today's price per unit. Profit uses today's cost per unit.

**Step 6: reality check, then add up.** Multiply by what new buyers really bought in the past, and by the share of new sales that is truly new (see below). Items we can't supply right now (Arizona) count as zero. Add up every item in every group: that is the total at the top.

**The "5 or 10 more stores out of 100" goals** skip Step 3: the goal is simply today's share plus 5 or 10 points, for items some stores in the group already buy.

${worked}
## How we know the numbers are realistic

**1. Do stores really buy that much when they add an item?** We looked at ${backtest.length.toLocaleString("en-US")} cases from the past where a store started buying an item 12–18 months ago, then followed what it bought over the next full year. The typical store bought **${realization.toFixed(2) === "1.00" ? "exactly the amount we assume" : `${realization.toFixed(2)} times the amount we assume`}**. Half of them landed between half and double that amount.

**2. Does a new item just take sales from items the store already buys?** Sometimes, and we take that off the total. Out of every $1 of new sales:

${taken.map((d) => `- **${SHORT_DEPT[d] ?? d}:** about ${cents(d)}¢ comes from similar items the store already buys from us${d === "Laundry" ? " (a laundromat customer buys one detergent either way)" : ""}.`).join("\n")}

For everything else we found no sign of this, so those new sales count in full.

**The low and high numbers.** The low number assumes every kind of product loses at least 30¢ of every new $1 to other items, like drinks do. The high number gives more weight to stores that bought more than usual (up to twice the usual amount).

## Keep in mind

- **Only sales through Mercaso count.** A store may already buy an item from someone else.
- **This is a yearly amount once stores have started buying,** not what the first year brings in.
- **Markets and smoke shops are probably worth more** than shown: the liquor catalog leaves out much of the grocery and tobacco they sell.
- **Some items are left out:** ${noPrice} items with no current price (mostly products we no longer list), and items we can't reliably supply right now (Arizona).
- How it was built: \`docs/exploration/penetration-lift.md\`.
`;
writeFileSync(join(OUT, "summary.md"), summary);
console.log(summary);
console.log(`wrote dist/lift/summary.md, items.csv (${itemRows.length} rows), stores.csv (${storeOut.length} rows)`);
