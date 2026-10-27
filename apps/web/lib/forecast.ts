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
//
// The current month counts as its actuals so far plus the forecast for its remaining days. The
// forecast runs to December of next year, so the fiscal years (January to December) can be summed:
// this year = the history months in it + the current month + the rest; next year = all forecast.

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
  /** The current month so far (see ForecastBase.current). */
  current?: Record<CurrentField, number>;
}

export const CURRENT_FIELDS = ["orders", "revenue", "units", "lines", "new", "saved", "churned", "wonBack"] as const;
export type CurrentField = (typeof CURRENT_FIELDS)[number];

export interface ForecastBase {
  schema_version: 1;
  as_of: string;
  /** First day of each history month, oldest first (12 complete months). */
  months: string[];
  /** The month after the history, so far: its first day, the days counted and its length. */
  current?: { month: string; elapsed_days: number; days_in_month: number };
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
  /** The current month only: its actuals so far (the rest of the point is actual + forecast). */
  actual?: Record<CurrentField, number>;
}

export interface Span {
  revenue: number;
  units: number;
  lines: number;
  orders: number;
  /** Customers at the span's last month end. */
  customers: number;
  new: number;
}

/** A fiscal year (January to December): what has happened, the forecast for the rest, and the total. */
export interface FiscalYear {
  year: number;
  actual: Span;
  rest: Span;
  total: Span;
}

export interface ForecastResult {
  points: MonthPoint[];
  /** Each driver's monthly values: history then forecast. */
  drivers: Record<Driver, number[]>;
  /** The last 12 months' and the next 12's totals, and the same for 6 months. */
  hero: Record<"past6" | "past12" | "next6" | "next12", Span>;
  /** This fiscal year and next (calendar years). */
  fiscal: FiscalYear[];
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

const ym = (m: string) => m.split("-").map(Number) as [number, number];

/** Months from the one after the history to December of the following year. */
export function fiscalHorizon(lastHistoryMonth: string): number {
  const [y, m] = ym(lastHistoryMonth);
  const firstY = m === 12 ? y + 1 : y;
  return (firstY + 1) * 12 + 12 - (y * 12 + m);
}

/** History and forecast for the stores in view (by default to December of next year). */
export function computeForecast(base: ForecastBase, set: ForecastSettings, horizon = fiscalHorizon(base.months[base.months.length - 1]!)): ForecastResult {
  const H = base.months.length;
  const keep = (c: ForecastCell) => (!set.types.length || set.types.includes(c.type)) && (!set.reps.length || set.reps.includes(c.rep));
  const cells = base.cells.filter(keep);
  const tot = (f: keyof Omit<ForecastCell, "rep" | "type" | "current">) => base.months.map((_, m) => sum(cells.map((c) => c[f][m]!)));
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
  const [y, mo] = ym(base.months[H - 1]!);
  const monthAt = (k: number) => {
    const i = y * 12 + (mo - 1) + k + 1;
    return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`;
  };
  // The current month so far, if the base has it: the forecast fills only its remaining days.
  const cur = base.current && base.current.month === monthAt(0) ? base.current : undefined;
  const actual = cur
    ? (Object.fromEntries(CURRENT_FIELDS.map((f) => [f, sum(cells.map((c) => c.current?.[f] ?? 0))])) as Record<CurrentField, number>)
    : undefined;
  const zero = Object.fromEntries(CURRENT_FIELDS.map((f) => [f, 0])) as Record<CurrentField, number>;
  for (let k = 0; k < horizon; k++) {
    const a = k === 0 && actual ? actual : zero;
    const rest = k === 0 && cur ? 1 - cur.elapsed_days / cur.days_in_month : 1;
    const atRisk = customers * next.atRisk[k]! * rest;
    const saved = a.saved + atRisk * next.saveRate[k]!;
    const churned = a.churned + atRisk * (1 - next.saveRate[k]!);
    const wonBack = Math.min(churnedPool, a.wonBack + next.wonBack[k]! * rest);
    const winBackRate = div(wonBack, churnedPool);
    const fresh = a.new + next.new[k]! * rest;
    customers = customers + fresh + wonBack - churned;
    churnedPool = churnedPool + churned - wonBack;
    const forecastOrders = customers * next.ordersPerCustomer[k]! * rest;
    const orders = a.orders + forecastOrders;
    const revenue = a.revenue + forecastOrders * next.aov[k]!;
    const units = a.units + forecastOrders * next.unitsPerOrder[k]!;
    const lines = a.lines + forecastOrders * next.linesPerOrder[k]!;
    points.push({
      month: monthAt(k),
      forecast: true,
      new: fresh,
      saved,
      churned,
      wonBack,
      saveRate: div(saved, saved + churned),
      winBackRate,
      customers,
      orders,
      revenue,
      units,
      lines,
      aov: div(revenue, orders),
      unitsPerOrder: div(units, orders),
      linesPerOrder: div(lines, orders),
      ...(a === actual ? { actual } : {}),
    });
  }
  const span = (list: MonthPoint[]): Span => ({
    revenue: sum(list.map((p) => p.revenue)),
    units: sum(list.map((p) => p.units)),
    lines: sum(list.map((p) => p.lines)),
    orders: sum(list.map((p) => p.orders)),
    customers: list[list.length - 1]?.customers ?? 0,
    new: sum(list.map((p) => p.new)),
  });
  const hist = points.slice(0, H);
  const fut = points.slice(H);
  // Fiscal years: the year of the first forecast month and the next, January to December.
  const fy0 = ym(monthAt(0))[0];
  const fiscal = [fy0, fy0 + 1].map((year): FiscalYear => {
    const inYear = points.filter((p) => ym(p.month)[0] === year);
    const done = inYear.filter((p) => !p.forecast);
    const part = inYear.find((p) => p.actual)?.actual;
    const actualSpan = span(done);
    if (part) {
      for (const f of ["revenue", "units", "lines", "orders", "new"] as const) actualSpan[f] += part[f];
    }
    const total = span(inYear);
    const rest: Span = {
      revenue: total.revenue - actualSpan.revenue,
      units: total.units - actualSpan.units,
      lines: total.lines - actualSpan.lines,
      orders: total.orders - actualSpan.orders,
      customers: total.customers,
      new: total.new - actualSpan.new,
    };
    return { year, actual: actualSpan, rest, total };
  });
  return {
    points,
    drivers: Object.fromEntries(DRIVERS.map((d) => [d, [...past[d], ...next[d]]])) as Record<Driver, number[]>,
    hero: { past6: span(hist.slice(-6)), past12: span(hist.slice(-12)), next6: span(fut.slice(0, 6)), next12: span(fut.slice(0, 12)) },
    fiscal,
  };
}
