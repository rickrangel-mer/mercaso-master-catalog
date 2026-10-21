/**
 * Growth to a target penetration (part 2 of docs/exploration/penetration-lift.md). Reads
 * data/raw/growth_stores.csv (`pnpm athena:export growth-stores`), data/raw/prospects.csv (the sales
 * prospect list), and, for gross margin per store type, pricing.csv, lift_stores.csv and
 * lift_store_skus.csv. Writes, under the gitignored dist/growth/:
 *   summary.md    plain-language summary: stores to add and the yearly gain per target
 *   targets.csv   per target and store type: stores, yearly sales and profit (low and expected)
 * Spend, prices and costs stay out of git.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { toCsv } from "../athena/lib.ts";
import { TIERS } from "../stores/lib.ts";
import { ACTIVE_DAYS, churnedYear, MIN_TENURE_DAYS, marginRate, plan, prospectType, statusOf, typeProfiles, type GrowthStore } from "./lib.ts";

const ROOT = process.cwd();
const OUT = join(ROOT, "dist/growth");
const TARGETS = [0.25, 0.3, 0.35];
const read = (file: string, hint: string): Record<string, string>[] => {
  const path = join(ROOT, file);
  if (!existsSync(path)) {
    console.error(`${file} is missing. ${hint}`);
    process.exit(1);
  }
  return parse(readFileSync(path, "utf8"), { columns: true, bom: true });
};

const stores: GrowthStore[] = read("data/raw/growth_stores.csv", "Run pnpm athena:export growth-stores.").map((r) => ({
  id: r.store_id!,
  type: r.store_type ?? "",
  first_order_date: r.first_order_date ?? "",
  last_order_date: r.last_order_date ?? "",
  spend_12m: Number(r.spend_12m) || 0,
  orders_12m: Number(r.orders_12m) || 0,
  spend_before: Number(r.spend_before) || 0,
  orders_before: Number(r.orders_before) || 0,
}));
const asOf = read("data/raw/growth_stores.csv", "")[0]?.as_of ?? new Date().toISOString().slice(0, 10);
const active = stores.filter((s) => statusOf(s, asOf) === "active");
const churned = stores.filter((s) => statusOf(s, asOf) === "churned");
const profiles = typeProfiles(stores, asOf);

const prospectRows = read("data/raw/prospects.csv", "Save the sales prospect list as data/raw/prospects.csv.");
const prospects = new Map<string, number>();
for (const r of prospectRows) {
  const t = prospectType(r.name ?? "");
  prospects.set(t, (prospects.get(t) ?? 0) + 1);
}

// Gross margin per store type, from what today's active stores buy in the catalogs.
const price = new Map(
  read("data/raw/pricing.csv", "Run pnpm athena:export pricing.").map((r) => [
    r.sku_number!,
    { price: Number(r.price) || 0, ...(r.average_cost === "" ? {} : { cost: Number(r.average_cost) }) },
  ]),
);
const typeOfStore = new Map(stores.map((s) => [s.id, s.type]));
const activeIds = new Set(active.map((s) => s.id));
const marginRows = new Map<string, { cases: number; price?: number; cost?: number }[]>();
const allRows: { cases: number; price?: number; cost?: number }[] = [];
if (existsSync(join(ROOT, "data/raw/lift_store_skus.csv"))) {
  for (const r of read("data/raw/lift_store_skus.csv", "")) {
    if (!activeIds.has(r.store_id!)) continue;
    const p = price.get(r.sku!);
    const row = { cases: Number(r.cases) || 0, ...(p ? { price: p.price, ...(p.cost !== undefined ? { cost: p.cost } : {}) } : {}) };
    const t = typeOfStore.get(r.store_id!) ?? "";
    const list = marginRows.get(t) ?? [];
    list.push(row);
    marginRows.set(t, list);
    allRows.push(row);
  }
}
const margin = new Map<string, number>();
for (const [t, rows] of marginRows) {
  const m = marginRate(rows);
  if (m !== undefined) margin.set(t, m);
}
const marginOverall = marginRate(allRows) ?? 0.13;

const result = plan({ active: active.length, prospects, churned: churned.map(churnedYear), profiles, margin, marginOverall }, TARGETS);

// --- Output ---
const short = (x: number) => (Math.abs(x) >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : `$${Math.round(x / 1000).toLocaleString("en-US")}K`);
const money = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const typeName = (t: string) => t || "No type set";

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, "targets.csv"),
  toCsv([
    ["target_pct", "source", "store_type", "stores", "sales_yr_low", "sales_yr_expected", "profit_yr_low", "profit_yr_expected"],
    ...result.targets.flatMap((t) => [
      ...t.byType.map((x) => [String(t.target * 100), "new store", typeName(x.type), x.stores.toFixed(1), x.sales.low.toFixed(0), x.sales.expected.toFixed(0), x.profit.low.toFixed(0), x.profit.expected.toFixed(0)]),
      [String(t.target * 100), "win-back", "", String(t.winBacks), t.winBackSales.low.toFixed(0), t.winBackSales.expected.toFixed(0), t.winBackProfit.low.toFixed(0), t.winBackProfit.expected.toFixed(0)],
    ]),
  ]),
);

const prospectTotal = prospectRows.length;
const unclear = prospects.get("") ?? 0;
const known = [...prospects].filter(([t]) => t !== "").sort((a, b) => b[1] - a[1]);
const shownTypes = [...profiles.values()].filter((p) => known.some(([t]) => t === p.type)).sort((a, b) => b.newStore.expected - a.newStore.expected);
const avgChurn = result.targets[0] ? result.targets[0].winBackSales.expected / Math.max(1, result.targets[0].winBacks) : 0;

const summary = `# What we gain by serving more of the market (${asOf})

## The short answer

| Goal | Stores to add | Extra profit a year | Extra sales a year |
|---|---|---|---|
${result.targets.map((t) => `| **${t.target * 100}%** of the market | ${n0(t.needed)} (${n0(t.newStores)} new, ${n0(t.winBacks)} won back) | **${short(t.profit.expected)}** (at least ${short(t.profit.low)}) | ${short(t.sales.expected)} (at least ${short(t.sales.low)}) |`).join("\n")}

These are yearly amounts once the stores are ordering, like the first report. "Profit" means gross margin: sales minus what the products cost us. The first number is for an average store; "at least" is for a typical (middle) store, since a few big accounts pull the average up.

## Where we are today

- **Our market: ${n0(result.market)} stores.** ${n0(active.length)} active stores (ordered in the last ${ACTIVE_DAYS} days), ${n0(prospectTotal)} on the prospect list and ${n0(churned.length)} that stopped ordering (ordered in the last 12 months, not in the last ${ACTIVE_DAYS} days).
- **Today we serve ${pct(result.today)} of it.** Every 1% more is about ${n0(result.market / 100)} stores.

## Where the extra stores come from

The stores we add come from the prospect list and from stores that stopped ordering, in proportion to their numbers (${pct(churned.length / (prospectTotal + churned.length))} of the stores we don't serve stopped ordering, so about ${pct(churned.length / (prospectTotal + churned.length))} of the added stores are win-backs).

| Goal | New stores | Won back | Profit from new stores | Profit from win-backs |
|---|---|---|---|---|
${result.targets.map((t) => `| ${t.target * 100}% | ${n0(t.newStores)} | ${n0(t.winBacks)} | ${short(t.profit.expected - t.winBackProfit.expected)} | ${short(t.winBackProfit.expected)} |`).join("\n")}

## How much a store spends

**A store we win back** comes back with the business it had in its last year with us. On average that was **${money(avgChurn)} a year** (a typical one: ${money(result.targets[0] ? result.targets[0].winBackSales.low / Math.max(1, result.targets[0].winBacks) : 0)}).

**A new store** is expected to spend like today's active stores of the same kind, not like the stores we won a year or two ago, when we carried fewer products. We also keep today's mix of how often stores order: if a third of our gas stations order 21–50 times a year, a third of the new gas stations do too.

| Kind of store | On the prospect list | Spend a year: average new store | Typical new store | Profit margin |
|---|---|---|---|---|
${shownTypes.map((p) => `| ${typeName(p.type)} | ${n0(prospects.get(p.type) ?? 0)} | ${money(p.newStore.expected)} | ${money(p.newStore.low)} | ${pct(margin.get(p.type) ?? marginOverall)} |`).join("\n")}

${n0(unclear)} prospects have names that don't say what kind of store they are; they are counted with the same mix as the rest.

How often today's active stores order, by kind of store (share of stores):

| Kind of store | ${TIERS.map((t) => `${t.key} orders a year`).join(" | ")} |
|---|${TIERS.map(() => "---").join("|")}|
${shownTypes.map((p) => `| ${typeName(p.type)} | ${p.tierShare.map((s) => pct(s)).join(" | ")} |`).join("\n")}

## Keep in mind

- **New stores usually start slower** than stores we've served for years. These numbers are for once they're settled in; their first months will be lower.
- **Some of these stores will stop again.** The goal counts stores that are active, so stores that drop off have to be replaced to stay at the goal.
- **The prospect list has repeats** (about 1,440 rows share a name and place) and some chains (7-Eleven, Chevron, Shell) that may buy centrally. Both make the bigger goals harder to reach than the numbers suggest.
- **Profit margin** comes from what each kind of store buys from our catalogs today, at today's prices and costs.
- Stores open less than a year are scaled up to a full year (counting at least ${MIN_TENURE_DAYS} days).
`;
writeFileSync(join(OUT, "summary.md"), summary);
console.log(summary);
console.log("wrote dist/growth/summary.md and targets.csv");
