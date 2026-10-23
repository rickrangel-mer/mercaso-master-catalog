/**
 * Month-over-month store acquisition by rep (docs/exploration/acquisition.md). Reads
 * data/raw/market_stores.csv and data/raw/market_store_days.csv (`pnpm athena:export market-stores
 * market-store-days`) and data/raw/prospects.csv. Writes dist/acquisition/acquisition.json
 * (gitignored): per rep and store type, for each of the last 13 months (the current one to date),
 * stores acquired, prospects at the start of the month and stores active at its end, and the market.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { prospectType } from "../growth/lib.ts";
import { indexer, repsByZip, typeWeights, UNTYPED } from "../market/lib.ts";
import { activeAt, monthEnd, monthIndex, monthStarts } from "./lib.ts";

const ROOT = process.cwd();
const UNASSIGNED = "Unassigned";
const MONTHS = 13;
const read = (file: string, hint: string): Record<string, string>[] => {
  const path = join(ROOT, file);
  if (!existsSync(path)) {
    console.error(`${file} is missing. ${hint}`);
    process.exit(1);
  }
  return parse(readFileSync(path, "utf8"), { columns: true, bom: true });
};

const stores = read("data/raw/market_stores.csv", "Run pnpm athena:export market-stores market-store-days.");
const asOf = stores[0]?.as_of ?? new Date().toISOString().slice(0, 10);
const starts = monthStarts(asOf, MONTHS);
const ends = starts.map((s) => monthEnd(s, asOf));
const days = new Map<string, string[]>();
for (const r of read("data/raw/market_store_days.csv", "Run pnpm athena:export market-store-days.")) {
  const list = days.get(r.store_id!) ?? [];
  list.push(r.order_date!);
  days.set(r.store_id!, list);
}
for (const l of days.values()) l.sort();
const prospects = read("data/raw/prospects.csv", "Save the sales prospect list as data/raw/prospects.csv.");
const repOfZip = repsByZip(prospects.filter((p) => p.zone !== UNASSIGNED).map((p) => ({ zip: p.zip_code ?? "", rep: p.salesperson ?? "" })));

const reps: string[] = [];
const repAt = indexer(reps);
const types: string[] = [];
const typeAt = indexer(types);
interface Cell {
  rep: number;
  type: number;
  market: number;
  acquired: number[];
  prospectsStart: number[];
  activeEnd: number[];
}
const cells = new Map<string, Cell>();
const cellOf = (rep: string, type: string) => {
  const r = repAt(rep);
  const t = typeAt(type || "No type set");
  const key = `${r}|${t}`;
  let c = cells.get(key);
  if (!c) cells.set(key, (c = { rep: r, type: t, market: 0, acquired: Array(MONTHS).fill(0), prospectsStart: Array(MONTHS).fill(0), activeEnd: Array(MONTHS).fill(0) }));
  return c;
};

// Customers: acquired in the month of their first order, prospects until then. A store with no type
// takes the type its name says, else is spread over the typed stores' types (as prospects are).
const customerMix = new Map<string, number>();
for (const s of stores) {
  const t = (s.store_type ?? "").trim();
  if (!UNTYPED.has(t)) customerMix.set(t, (customerMix.get(t) ?? 0) + 1);
}
for (const s of stores) {
  const first = monthIndex(s.first_order_date ?? "", starts);
  const active = ends.map((e) => activeAt(days.get(s.store_id!) ?? [], e));
  for (const [type, w] of typeWeights(s.store_type ?? "", s.store_name ?? "", prospectType, customerMix)) {
    const c = cellOf(repOfZip.get((s.postal_code ?? "").slice(0, 5)) ?? UNASSIGNED, type);
    c.market += w;
    if (first >= 0 && first < MONTHS) c.acquired[first]! += w;
    for (let m = 0; m < MONTHS; m++) {
      if (first >= m) c.prospectsStart[m]! += w;
      if (active[m]) c.activeEnd[m]! += w;
    }
  }
}
// Today's prospect list: prospects in every month. A name that doesn't say the type is spread over
// the other prospects' types, in their proportions.
const typed = prospects.map((p) => ({ p, t: prospectType(p.name ?? "") }));
const mix = new Map<string, number>();
for (const { t } of typed) if (t) mix.set(t, (mix.get(t) ?? 0) + 1);
const mixTotal = [...mix.values()].reduce((a, b) => a + b, 0);
for (const { p, t } of typed) {
  const rep = p.zone === UNASSIGNED || !p.salesperson ? UNASSIGNED : p.salesperson;
  for (const [type, w] of t ? [[t, 1] as const] : [...mix].map(([mt, n]) => [mt, n / mixTotal] as const)) {
    const c = cellOf(rep, type);
    c.market += w;
    for (let m = 0; m < MONTHS; m++) c.prospectsStart[m]! += w;
  }
}

const repOrder = [...reps.filter((r) => r !== UNASSIGNED).sort(), ...(reps.includes(UNASSIGNED) ? [UNASSIGNED] : [])];
const typeSize = (i: number) => [...cells.values()].filter((c) => c.type === i).reduce((a, c) => a + c.market, 0);
const typeOrder = types.map((_, i) => i).sort((a, b) => typeSize(b) - typeSize(a));
const r2 = (x: number) => Math.round(x * 100) / 100;
const base = {
  schema_version: 1,
  as_of: asOf,
  months: starts,
  /** The last month runs to the as-of date. */
  partial: ends[MONTHS - 1] !== monthEnd(starts[MONTHS - 1]!, "9999-12-31"),
  reps: repOrder,
  types: typeOrder.map((i) => types[i]!),
  cells: [...cells.values()].map((c) => ({
    rep: repOrder.indexOf(reps[c.rep]!),
    type: typeOrder.indexOf(c.type),
    market: r2(c.market),
    acquired: c.acquired.map(r2),
    prospectsStart: c.prospectsStart.map(r2),
    activeEnd: c.activeEnd.map(r2),
  })),
};
mkdirSync(join(ROOT, "dist/acquisition"), { recursive: true });
writeFileSync(join(ROOT, "dist/acquisition/acquisition.json"), JSON.stringify(base));

const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
console.log(`Acquisition base: ${base.cells.length} cells, months ${starts[0]} to ${starts[MONTHS - 1]} (to ${asOf}).`);
console.log(`${"Rep".padEnd(24)}${starts.map((s) => s.slice(2, 7).padStart(6)).join("")}  total  pen. ${starts[0]!.slice(0, 7)} → now`);
for (const [i, r] of repOrder.entries()) {
  const mine = base.cells.filter((c) => c.rep === i);
  const acq = starts.map((_, m) => mine.reduce((a, c) => a + c.acquired[m]!, 0));
  const market = mine.reduce((a, c) => a + c.market, 0);
  const pen = (m: number) => `${((mine.reduce((a, c) => a + c.activeEnd[m]!, 0) / market) * 100).toFixed(1)}%`;
  console.log(`${r.padEnd(24)}${acq.map((x) => n0(x).padStart(6)).join("")}  ${n0(acq.reduce((a, b) => a + b, 0)).padStart(5)}  ${pen(0)} → ${pen(MONTHS - 1)}`);
}
