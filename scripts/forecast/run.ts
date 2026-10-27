/**
 * The Forecast tab's base file (docs/exploration/forecast.md). Reads data/raw/market_stores.csv,
 * market_store_days.csv and forecast_store_months.csv (`pnpm athena:export market-stores
 * market-store-days forecast-store-months`) and prospects.csv (reps by ZIP). Writes
 * dist/forecast/forecast.json (gitignored): per rep × store type and each of the last 12 complete
 * months, the orders, sales, units and lines, and the customer flows (new, saved, churned, won back)
 * with the customers and churned stores they move between; and the same for the current month so far
 * (to the day before the as-of date), which the site counts as actual plus the rest forecast.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { prospectType } from "../growth/lib.ts";
import { indexer, repsByZip, typeWeights, UNTYPED } from "../market/lib.ts";
import { monthEnd, monthStarts } from "../acquisition/lib.ts";
import { isChurned, isCustomer, storeEvents } from "./lib.ts";

const ROOT = process.cwd();
const UNASSIGNED = "Unassigned";
const MONTHS = 12;
/** The order-day export starts here; a store that ordered earlier gets the day before as a stand-in. */
const DAYS_FROM = "2025-03-01";
const BEFORE = "2025-02-28";
const read = (file: string, hint: string): Record<string, string>[] => {
  const path = join(ROOT, file);
  if (!existsSync(path)) {
    console.error(`${file} is missing. ${hint}`);
    process.exit(1);
  }
  return parse(readFileSync(path, "utf8"), { columns: true, bom: true });
};
const hint = "Run pnpm athena:export market-stores market-store-days forecast-store-months.";
const stores = read("data/raw/market_stores.csv", hint);
const asOf = stores[0]?.as_of ?? new Date().toISOString().slice(0, 10);
// The last 12 complete months.
const prevMonth = (() => {
  const [y, m] = asOf.split("-").map(Number) as [number, number];
  const k = y * 12 + (m - 1) - 1;
  return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}-01`;
})();
const starts = monthStarts(prevMonth, MONTHS);
const ends = starts.map((s) => monthEnd(s, "9999-12-31"));
const dayBefore = (d: string) => new Date(Date.parse(d) - 86_400_000).toISOString().slice(0, 10);
const monthOf = (d: string) => starts.indexOf(`${d.slice(0, 7)}-01`);
// The current month so far: through the day before the as-of date (the export runs during the day).
const current = `${asOf.slice(0, 7)}-01`;
const through = dayBefore(asOf);
const elapsedDays = Number(through.slice(8, 10));
const daysInMonth = Number(monthEnd(current, "9999-12-31").slice(8, 10));
const CURRENT_FIELDS = ["orders", "revenue", "units", "lines", "new", "saved", "churned", "wonBack"] as const;
type CurrentField = (typeof CURRENT_FIELDS)[number];

const days = new Map<string, string[]>();
for (const r of read("data/raw/market_store_days.csv", hint)) {
  const l = days.get(r.store_id!) ?? [];
  l.push(r.order_date!);
  days.set(r.store_id!, l);
}
const months = new Map<string, Record<string, string>[]>();
for (const r of read("data/raw/forecast_store_months.csv", hint)) {
  const l = months.get(r.store_id!) ?? [];
  l.push(r);
  months.set(r.store_id!, l);
}
const prospects = read("data/raw/prospects.csv", "Save the sales prospect list as data/raw/prospects.csv.");
const repOfZip = repsByZip(prospects.filter((p) => p.zone !== UNASSIGNED).map((p) => ({ zip: p.zip_code ?? "", rep: p.salesperson ?? "" })));
const mix = new Map<string, number>();
for (const s of stores) {
  const t = (s.store_type ?? "").trim();
  if (!UNTYPED.has(t)) mix.set(t, (mix.get(t) ?? 0) + 1);
}

const FIELDS = ["orders", "revenue", "units", "lines", "ordering", "customersStart", "customersEnd", "churnedStart", "new", "saved", "churned", "wonBack"] as const;
type Field = (typeof FIELDS)[number];
const reps: string[] = [];
const repAt = indexer(reps);
const types: string[] = [];
const typeAt = indexer(types);
const cells = new Map<string, { rep: number; type: number; current: Record<CurrentField, number> } & Record<Field, number[]>>();
const cellOf = (rep: string, type: string) => {
  const r = repAt(rep);
  const t = typeAt(type);
  const key = `${r}|${t}`;
  let c = cells.get(key);
  if (!c)
    cells.set(
      key,
      (c = {
        rep: r,
        type: t,
        current: Object.fromEntries(CURRENT_FIELDS.map((f) => [f, 0])) as Record<CurrentField, number>,
        ...(Object.fromEntries(FIELDS.map((f) => [f, Array(MONTHS).fill(0)])) as Record<Field, number[]>),
      }),
    );
  return c;
};

for (const s of stores) {
  const first = s.first_order_date ?? "";
  let d = [...new Set(days.get(s.store_id!) ?? [])].sort();
  if (first && first < DAYS_FROM && (d.length === 0 || d[0]! > BEFORE)) d = [BEFORE, ...d];
  if (d.length === 0) continue;
  const events = storeEvents(first, d, asOf);
  const own = new Map<Field, number[]>(FIELDS.map((f) => [f, Array(MONTHS).fill(0)]));
  const now = Object.fromEntries(CURRENT_FIELDS.map((f) => [f, 0])) as Record<CurrentField, number>;
  for (const e of events) {
    const f: Field & CurrentField = e.kind === "new" ? "new" : e.kind === "saved" ? "saved" : e.kind === "churned" ? "churned" : "wonBack";
    if (e.date.slice(0, 7) === current.slice(0, 7)) {
      if (e.date <= through) now[f]++;
      continue;
    }
    const m = monthOf(e.date);
    if (m < 0) continue;
    own.get(f)![m]!++;
  }
  for (let m = 0; m < MONTHS; m++) {
    const before = dayBefore(starts[m]!);
    if (isCustomer(d, before)) own.get("customersStart")![m] = 1;
    if (isCustomer(d, ends[m]!)) own.get("customersEnd")![m] = 1;
    if (isChurned(d, before)) own.get("churnedStart")![m] = 1;
  }
  for (const r of months.get(s.store_id!) ?? []) {
    if ((r.month ?? "").slice(0, 7) === current.slice(0, 7)) {
      now.orders += Number(r.orders) || 0;
      now.revenue += Number(r.revenue) || 0;
      now.units += Number(r.units) || 0;
      now.lines += Number(r.lines) || 0;
      continue;
    }
    const m = monthOf(r.month ?? "");
    if (m < 0) continue;
    own.get("orders")![m]! += Number(r.orders) || 0;
    own.get("revenue")![m]! += Number(r.revenue) || 0;
    own.get("units")![m]! += Number(r.units) || 0;
    own.get("lines")![m]! += Number(r.lines) || 0;
    if ((Number(r.orders) || 0) > 0) own.get("ordering")![m] = 1;
  }
  const rep = repOfZip.get((s.postal_code ?? "").slice(0, 5)) ?? UNASSIGNED;
  for (const [type, w] of typeWeights(s.store_type ?? "", s.store_name ?? "", prospectType, mix)) {
    const c = cellOf(rep, type);
    for (const f of FIELDS) for (let m = 0; m < MONTHS; m++) c[f][m]! += own.get(f)![m]! * w;
    for (const f of CURRENT_FIELDS) c.current[f] += now[f] * w;
  }
}

const repOrder = [...reps.filter((r) => r !== UNASSIGNED).sort(), ...(reps.includes(UNASSIGNED) ? [UNASSIGNED] : [])];
const size = (i: number) => [...cells.values()].filter((c) => c.type === i).reduce((a, c) => a + c.customersEnd[MONTHS - 1]!, 0);
const typeOrder = types.map((_, i) => i).sort((a, b) => size(b) - size(a));
const r2 = (x: number) => Math.round(x * 100) / 100;
const base = {
  schema_version: 1,
  as_of: asOf,
  months: starts,
  /** The current month so far: its first day, the days counted (through the day before as_of) and its length. */
  current: { month: current, elapsed_days: elapsedDays, days_in_month: daysInMonth },
  reps: repOrder,
  types: typeOrder.map((i) => types[i]!),
  cells: [...cells.values()].map((c) => ({
    rep: repOrder.indexOf(reps[c.rep]!),
    type: typeOrder.indexOf(c.type),
    ...Object.fromEntries(FIELDS.map((f) => [f, c[f].map(f === "revenue" ? Math.round : r2)])),
    current: Object.fromEntries(CURRENT_FIELDS.map((f) => [f, f === "revenue" ? Math.round(c.current[f]) : r2(c.current[f])])),
  })),
};
mkdirSync(join(ROOT, "dist/forecast"), { recursive: true });
writeFileSync(join(ROOT, "dist/forecast/forecast.json"), JSON.stringify(base));

// Printout and the accounting check: customers at a month's end = at its start + new + won back − churned.
const tot = (f: Field) => starts.map((_, m) => [...cells.values()].reduce((a, c) => a + c[f][m]!, 0));
const T = Object.fromEntries(FIELDS.map((f) => [f, tot(f)])) as Record<Field, number[]>;
const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
console.log(`Forecast base: ${base.cells.length} cells, ${starts[0]} to ${starts[MONTHS - 1]}, as of ${asOf}.`);
console.log("month    custStart  new  saved  churned  wonBack  custEnd  check   orders  ordering  AOV   units/ord lines/ord");
starts.forEach((s, m) => {
  const check = T.customersStart[m]! + T.new[m]! + T.wonBack[m]! - T.churned[m]! - T.customersEnd[m]!;
  console.log(
    `${s.slice(0, 7)}  ${n0(T.customersStart[m]!).padStart(8)} ${n0(T.new[m]!).padStart(4)} ${n0(T.saved[m]!).padStart(6)} ${n0(T.churned[m]!).padStart(8)} ${n0(T.wonBack[m]!).padStart(8)} ${n0(T.customersEnd[m]!).padStart(8)} ${check.toFixed(0).padStart(6)} ${n0(T.orders[m]!).padStart(8)} ${n0(T.ordering[m]!).padStart(8)}  $${n0(T.revenue[m]! / T.orders[m]!)}  ${(T.units[m]! / T.orders[m]!).toFixed(1).padStart(6)}   ${(T.lines[m]! / T.orders[m]!).toFixed(1).padStart(6)}`,
  );
});
