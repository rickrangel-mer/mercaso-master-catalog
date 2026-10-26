// The tables behind the Wallet, Market and Acquisition tabs, as CSV rows. The tabs' Download CSV
// buttons export what is on screen; `pnpm datapack` writes the same tables at the default settings,
// so a number on screen can be found in a file.
import { valueAt, type AcquisitionBase, type RepSeries } from "./acquisition";
import { DIMS, type MarketBase, type MarketResult } from "./market";
import type { WalletBase, WalletResult } from "./wallet";

/** Round for a CSV cell: whole numbers plain, otherwise `digits` decimals (NaN → empty). */
export const cell = (x: number, digits = 2) => (Number.isFinite(x) ? (Number.isInteger(x) ? String(x) : x.toFixed(digits)) : "");

/** CSV text: quotes where needed, CRLF between rows. */
export function toCsv(rows: string[][]): string {
  const q = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}

/** Per department: dollars and SKUs per order at each snapshot, catalog penetration, SKUs per store, and the yearly gains. */
export function walletRows(base: WalletBase, r: WalletResult): string[][] {
  const money = !base.no_money;
  const snaps = [
    ["then", r.then],
    ["today", r.today],
    ["6mo", r.shortTerm],
    ["12mo", r.longTerm],
  ] as const;
  const header = [
    "department",
    ...(money ? snaps.map(([k]) => `dollars_per_order_${k}`) : []),
    ...(money ? ["new_dollars_per_order_6mo", "new_dollars_per_order_12mo"] : []),
    ...snaps.map(([k]) => `skus_per_order_${k}`),
    "new_skus_per_order_6mo",
    "new_skus_per_order_12mo",
    "skus_per_store_then",
    "skus_per_store_today",
    "skus_per_store_best",
    "skus_per_store_6mo",
    "skus_per_store_12mo",
    "catalog_items_in_scope",
    "catalog_penetration_then",
    "catalog_penetration_today",
    "catalog_penetration_best",
    "catalog_penetration_6mo",
    "catalog_penetration_12mo",
    ...(money ? ["catalog_share_of_spend", "revenue_added_6mo", "revenue_added_12mo", "profit_added_6mo", "profit_added_12mo"] : []),
  ];
  const rows = base.groups.map((name, g) => {
    const gp = r.groups[g]!;
    return [
      name,
      ...(money ? snaps.map(([, s]) => cell(s.aov[g]!)) : []),
      ...(money ? [cell(r.shortTerm.aovAdded[g]!), cell(r.longTerm.aovAdded[g]!)] : []),
      ...snaps.map(([, s]) => cell(s.lines[g]!)),
      cell(r.shortTerm.linesAdded[g]!),
      cell(r.longTerm.linesAdded[g]!),
      cell(gp.skusThen),
      cell(gp.skusToday),
      cell(gp.skusBest),
      cell(r.shortTerm.skus[g]!),
      cell(r.longTerm.skus[g]!),
      cell(gp.itemsPerStore, 1),
      cell(gp.then, 4),
      cell(gp.today, 4),
      cell(gp.best, 4),
      cell(gp.shortTerm, 4),
      cell(gp.longTerm, 4),
      ...(money ? [cell(gp.coverage, 4), cell(gp.shortRevenue, 0), cell(gp.longRevenue, 0), cell(gp.shortProfit, 0), cell(gp.longProfit, 0)] : []),
    ];
  });
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const total = [
    "All departments",
    ...(money ? snaps.map(([, s]) => cell(sum(s.aov))) : []),
    ...(money ? [cell(sum(r.shortTerm.aovAdded)), cell(sum(r.longTerm.aovAdded))] : []),
    ...snaps.map(([, s]) => cell(sum(s.lines))),
    cell(sum(r.shortTerm.linesAdded)),
    cell(sum(r.longTerm.linesAdded)),
    ...Array(11).fill(""),
    ...(money
      ? ["", cell(sum(r.groups.map((x) => x.shortRevenue)), 0), cell(sum(r.groups.map((x) => x.longRevenue)), 0), cell(sum(r.groups.map((x) => x.shortProfit)), 0), cell(sum(r.groups.map((x) => x.longProfit)), 0)]
      : []),
  ];
  return [header, ...rows, total];
}

/** Every group of every dimension (zone, sub-area, store type, rep) and the total: stores, targets, penetration and dollars. */
export function marketRows(base: MarketBase, r: MarketResult): string[][] {
  const money = !base.no_money;
  const header = [
    "dimension",
    "group",
    "zone",
    "market",
    "active",
    "stopped_ordering",
    "prospects",
    "new_stores_last_12mo",
    "new_6mo",
    "new_12mo",
    "won_back_6mo",
    "won_back_12mo",
    "penetration_today",
    "penetration_6mo",
    "penetration_12mo",
    ...(money ? ["revenue_today", "revenue_added_6mo", "revenue_added_12mo", "profit_today", "profit_added_6mo", "profit_added_12mo"] : []),
  ];
  const label: Record<string, string> = { zone: "zone", area: "sub-area", type: "store type", rep: "rep" };
  const line = (dim: string, g: MarketResult["total"]) => [
    dim,
    g.name,
    g.zone !== undefined ? (base.zones[g.zone] ?? "") : "",
    cell(g.market),
    cell(g.active),
    cell(g.churned),
    cell(g.prospects),
    cell(g.newPace),
    cell(g.newShort),
    cell(g.newLong),
    cell(g.backShort),
    cell(g.backLong),
    cell(g.today, 4),
    cell(g.short, 4),
    cell(g.long, 4),
    ...(money ? [cell(g.revenue, 0), cell(g.revenueShort, 0), cell(g.revenueLong, 0), cell(g.profit, 0), cell(g.profitShort, 0), cell(g.profitLong, 0)] : []),
  ];
  return [header, line("total", r.total), ...DIMS.flatMap((d) => r.groups[d].filter((g) => g.market >= 0.5).map((g) => line(label[d]!, g)))];
}

/** Per rep (and all reps) and month: acquired, prospects at the start, rate, active at the end, market, penetration. */
export function acquisitionRows(base: AcquisitionBase, reps: RepSeries[], total: RepSeries): string[][] {
  const header = ["rep", "month", "partial_month", "acquired", "prospects_at_start", "acquisition_rate", "active_at_month_end", "market", "penetration"];
  const last = base.months.length - 1;
  const rows = [...reps.filter((s) => s.market >= 0.5), total].flatMap((s) =>
    base.months.map((m, k) => [
      s.name,
      m.slice(0, 7),
      base.partial && k === last ? `to ${base.as_of}` : "",
      cell(s.acquired[k]!),
      cell(s.prospectsStart[k]!),
      cell(valueAt(s, k, "rate"), 4),
      cell(s.activeEnd[k]!),
      cell(s.market),
      cell(valueAt(s, k, "penetration"), 4),
    ]),
  );
  return [header, ...rows];
}

/** Saves rows as a CSV file in the browser. */
export function downloadCsv(name: string, rows: string[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
