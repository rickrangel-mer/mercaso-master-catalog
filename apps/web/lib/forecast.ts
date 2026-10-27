// The Forecast tab: the last 12 months of customers and orders, and the next 12 forecast from them.
// Decisions in docs/exploration/forecast.md (Rick, 2026-10-27).
//
// Customers (ordered in the last 90 days) move each month by
//   customers' = customers + new + won back − churned        (exact in the history)
//   churned    = customers × at-risk rate × (1 − save rate)   saved = the rest of those at risk
//   won back   forecast from its own monthly history, like new customers (the pool of churned stores
//              keeps growing, but stores that churned long ago rarely come back, so a rate on the
//              pool would overstate it); the win-back rate shown is won back ÷ churned stores
// and orders = customers × orders per customer; sales, units and SKU lines = orders × AOV, units
// per order and lines per order. Every driver is forecast from its own last 12 months: a straight
// trend fitted to them, either held at its last value or continued, and either shaped like the same
// calendar month last year (seasonal) or not (linear); then × (1 + the adjustment).

export interface ForecastCell {
  rep: number;
  type: number;
  orders: number[];
  revenue: number[];
  units: number[];
  lines: number[];
  ordering: number[];
  customersStart: number[];
  customersEnd: number[];
  churnedStart: number[];
  new: number[];
  saved: number[];
  churned: number[];
  wonBack: number[];
}

export interface ForecastBase {
  schema_version: 1;
  as_of: string;
  /** First day of each history month, oldest first (12 complete months). */
  months: string[];
  reps: string[];
  types: string[];
  cells: ForecastCell[];
  /** Set in the no-prices build: revenue is zeroed. */
  no_money?: boolean;
}

export const DRIVERS = ["new", "atRisk", "saveRate", "wonBack", "ordersPerCustomer", "aov", "unitsPerOrder", "linesPerOrder"] as const;
export type Driver = (typeof DRIVERS)[number];
export const RATES: Driver[] = ["atRisk", "saveRate"];

export interface ForecastSettings {
  /** Store types and reps in view (indexes); empty = all. */
  types: number[];
  reps: number[];
  /** "seasonal": each month shaped like the same month last year; "linear": a smooth line. */
  shape: "seasonal" | "linear";
  /** "hold": the trend's last value; "trend": the trend continued. */
  level: "hold" | "trend";
  /** Relative adjustment per driver (0.05 = 5% more). */
  adjust: Partial<Record<Driver, number>>;
}

export const DEFAULT_FORECAST: ForecastSettings = { types: [], reps: [], shape: "seasonal", level: "hold", adjust: {} };

export interface MonthPoint {
  month: string;
  forecast: boolean;
  new: number;
  saved: number;
  churned: number;
  wonBack: number;
  /** Saves ÷ (saves + churned): the share of customers at risk who ordered again in time. */
  saveRate: number;
  /** Won back ÷ churned stores at the month's start. */
  winBackRate: number;
  /** Customers at the month's end (ordered in the last 90 days). */
  customers: number;
  orders: number;
  revenue: number;
  units: number;
  lines: number;
  aov: number;
  unitsPerOrder: number;
  linesPerOrder: number;
}

export interface ForecastResult {
  points: MonthPoint[];
  /** Each driver's monthly values: history then forecast. */
  drivers: Record<Driver, number[]>;
  /** The last 12 months' and the next 12's totals, and the same for 6 months. */
  hero: Record<"past6" | "past12" | "next6" | "next12", { revenue: number; units: number; lines: number; orders: number; customers: number; new: number }>;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const div = (a: number, b: number) => (b ? a / b : 0);

/** Least-squares line through (0, y0) … (n−1, yn−1). */
export function fitLine(ys: number[]): { a: number; b: number } {
  const n = ys.length;
  const mx = (n - 1) / 2;
  const my = sum(ys) / n;
  let sxy = 0;
  let sxx = 0;
  ys.forEach((y, x) => {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
  });
  const b = sxx ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

/** The next n values of a monthly series, by the settings' shape and level, × (1 + adjust). */
export function project(history: number[], n: number, shape: ForecastSettings["shape"], level: ForecastSettings["level"], adjust = 0, rate = false): number[] {
  const h = history.length;
  const { a, b } = fitLine(history);
  const at = (t: number) => a + b * t;
  // Each month against the trend line: last year's shape.
  const ratio = history.map((y, t) => (at(t) > 0 ? y / at(t) : 1));
  return Array.from({ length: n }, (_, k) => {
    const base = Math.max(0, level === "hold" ? at(h - 1) : at(h + k));
    const v = (shape === "seasonal" ? base * ratio[k % h]! : base) * (1 + adjust);
    return rate ? Math.min(1, Math.max(0, v)) : Math.max(0, v);
  });
}

/** History and forecast for the stores in view. */
export function computeForecast(base: ForecastBase, set: ForecastSettings, horizon = 12): ForecastResult {
  const H = base.months.length;
  const keep = (c: ForecastCell) => (!set.types.length || set.types.includes(c.type)) && (!set.reps.length || set.reps.includes(c.rep));
  const cells = base.cells.filter(keep);
  const tot = (f: keyof Omit<ForecastCell, "rep" | "type">) => base.months.map((_, m) => sum(cells.map((c) => c[f][m]!)));
  const T = {
    orders: tot("orders"),
    revenue: tot("revenue"),
    units: tot("units"),
    lines: tot("lines"),
    customersStart: tot("customersStart"),
    customersEnd: tot("customersEnd"),
    churnedStart: tot("churnedStart"),
    new: tot("new"),
    saved: tot("saved"),
    churned: tot("churned"),
    wonBack: tot("wonBack"),
  };
  const past: Record<Driver, number[]> = {
    new: T.new,
    atRisk: base.months.map((_, m) => div(T.saved[m]! + T.churned[m]!, T.customersStart[m]!)),
    saveRate: base.months.map((_, m) => div(T.saved[m]!, T.saved[m]! + T.churned[m]!)),
    wonBack: T.wonBack,
    ordersPerCustomer: base.months.map((_, m) => div(T.orders[m]!, T.customersEnd[m]!)),
    aov: base.months.map((_, m) => div(T.revenue[m]!, T.orders[m]!)),
    unitsPerOrder: base.months.map((_, m) => div(T.units[m]!, T.orders[m]!)),
    linesPerOrder: base.months.map((_, m) => div(T.lines[m]!, T.orders[m]!)),
  };
  const next = Object.fromEntries(
    DRIVERS.map((d) => [d, project(past[d], horizon, set.shape, set.level, set.adjust[d] ?? 0, RATES.includes(d))]),
  ) as Record<Driver, number[]>;

  const points: MonthPoint[] = base.months.map((month, m) => ({
    month,
    forecast: false,
    new: T.new[m]!,
    saved: T.saved[m]!,
    churned: T.churned[m]!,
    wonBack: T.wonBack[m]!,
    saveRate: past.saveRate[m]!,
    winBackRate: div(T.wonBack[m]!, T.churnedStart[m]!),
    customers: T.customersEnd[m]!,
    orders: T.orders[m]!,
    revenue: T.revenue[m]!,
    units: T.units[m]!,
    lines: T.lines[m]!,
    aov: past.aov[m]!,
    unitsPerOrder: past.unitsPerOrder[m]!,
    linesPerOrder: past.linesPerOrder[m]!,
  }));
  // Simulate the stocks forward from the last month's end.
  let customers = T.customersEnd[H - 1]!;
  let churnedPool = T.churnedStart[H - 1]! + T.churned[H - 1]! - T.wonBack[H - 1]!;
  const [y, mo] = base.months[H - 1]!.split("-").map(Number) as [number, number];
  for (let k = 0; k < horizon; k++) {
    const atRisk = customers * next.atRisk[k]!;
    const saved = atRisk * next.saveRate[k]!;
    const churned = atRisk - saved;
    const wonBack = Math.min(churnedPool, next.wonBack[k]!);
    const winBackRate = div(wonBack, churnedPool);
    const fresh = next.new[k]!;
    customers = customers + fresh + wonBack - churned;
    churnedPool = churnedPool + churned - wonBack;
    const orders = customers * next.ordersPerCustomer[k]!;
    const i = y * 12 + (mo - 1) + k + 1;
    points.push({
      month: `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`,
      forecast: true,
      new: fresh,
      saved,
      churned,
      wonBack,
      saveRate: next.saveRate[k]!,
      winBackRate,
      customers,
      orders,
      revenue: orders * next.aov[k]!,
      units: orders * next.unitsPerOrder[k]!,
      lines: orders * next.linesPerOrder[k]!,
      aov: next.aov[k]!,
      unitsPerOrder: next.unitsPerOrder[k]!,
      linesPerOrder: next.linesPerOrder[k]!,
    });
  }
  const span = (list: MonthPoint[]) => ({
    revenue: sum(list.map((p) => p.revenue)),
    units: sum(list.map((p) => p.units)),
    lines: sum(list.map((p) => p.lines)),
    orders: sum(list.map((p) => p.orders)),
    customers: list[list.length - 1]?.customers ?? 0,
    new: sum(list.map((p) => p.new)),
  });
  const hist = points.slice(0, H);
  const fut = points.slice(H);
  return {
    points,
    drivers: Object.fromEntries(DRIVERS.map((d) => [d, [...past[d], ...next[d]]])) as Record<Driver, number[]>,
    hero: { past6: span(hist.slice(-6)), past12: span(hist.slice(-12)), next6: span(fut.slice(0, 6)), next12: span(fut.slice(0, 12)) },
  };
}
