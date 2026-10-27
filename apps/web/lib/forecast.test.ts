import { describe, expect, it } from "vitest";
import { computeForecast, DEFAULT_FORECAST, fiscalHorizon, fitLine, project, type ForecastBase, type ForecastCell } from "./forecast.ts";

describe("fitLine and project", () => {
  it("fits a straight line", () => {
    const { a, b } = fitLine([1, 3, 5, 7]);
    expect(a).toBeCloseTo(1);
    expect(b).toBeCloseTo(2);
  });

  it("holds the trend's last value or continues it, flat or shaped like last year", () => {
    const flat = [10, 10, 10, 10];
    expect(project(flat, 2, "linear", "hold")).toEqual([10, 10]);
    const rising = [10, 12, 14, 16];
    expect(project(rising, 2, "linear", "hold")).toEqual([16, 16]);
    expect(project(rising, 2, "linear", "trend").map((x) => Math.round(x))).toEqual([18, 20]);
    // A bumpy series: the seasonal shape repeats each month's ratio to the line.
    const bumpy = [8, 12, 8, 12];
    const s = project(bumpy, 4, "seasonal", "hold");
    expect(s[0]! < s[1]!).toBe(true);
    expect(s[2]! < s[3]!).toBe(true);
    expect(project(flat, 1, "linear", "hold", 0.05)[0]).toBeCloseTo(10.5);
    expect(project([0.9, 0.95], 1, "linear", "trend", 0.2, true)[0]).toBe(1); // rates stay within 0-1
  });
});

const months = ["2026-07-01", "2026-08-01", "2026-09-01"];
const cell = (extra: Partial<ForecastCell>): ForecastCell => ({
  rep: 0,
  type: 0,
  orders: [200, 200, 200],
  revenue: [200_000, 200_000, 200_000],
  units: [8000, 8000, 8000],
  lines: [6000, 6000, 6000],
  ordering: [80, 80, 80],
  customersStart: [100, 100, 100],
  customersEnd: [100, 100, 100],
  churnedStart: [50, 50, 50],
  new: [5, 5, 5],
  saved: [6, 6, 6],
  churned: [9, 9, 9],
  wonBack: [4, 4, 4],
  ...extra,
});
const base: ForecastBase = { schema_version: 1, as_of: "2026-10-27", months, reps: ["Ann", "Bob"], types: ["Liquor store"], cells: [cell({}), cell({ rep: 1 })] };

describe("computeForecast", () => {
  it("rebuilds the history and its rates", () => {
    const r = computeForecast(base, DEFAULT_FORECAST);
    const p = r.points[0]!;
    expect(p.customers).toBe(200);
    expect(p.saveRate).toBeCloseTo(6 / 15);
    expect(p.winBackRate).toBeCloseTo(4 / 50);
    expect(p.aov).toBe(1000);
    expect(p.linesPerOrder).toBe(30);
    expect(r.drivers.atRisk[0]).toBeCloseTo(30 / 200);
  });

  it("moves customers by new + won back − churned, with churned at risk × (1 − save rate)", () => {
    const r = computeForecast(base, DEFAULT_FORECAST, 1);
    const f = r.points[3]!;
    expect(f.forecast).toBe(true);
    expect(f.month).toBe("2026-10-01");
    // 200 customers × 15% at risk = 30; 40% saved = 12; 18 churned; 8 won back and 10 new, as in the history.
    expect(f.churned).toBeCloseTo(18);
    expect(f.wonBack).toBeCloseTo(8); // won back forecast from its own history: 8 a month
    expect(f.winBackRate).toBeCloseTo(8 / 110); // ÷ the churned stores after the last month (100 + 18 − 8)
    expect(f.customers).toBeCloseTo(200 + 10 + f.wonBack - 18);
    expect(f.revenue).toBeCloseTo(f.customers * 2 * 1000);
  });

  it("applies the adjustments and filters", () => {
    const more = computeForecast(base, { ...DEFAULT_FORECAST, adjust: { new: 0.5, aov: 0.1 } }, 1).points[3]!;
    expect(more.new).toBeCloseTo(15);
    expect(more.aov).toBeCloseTo(1100);
    expect(computeForecast(base, { ...DEFAULT_FORECAST, reps: [1] }).points[0]!.customers).toBe(100);
  });

  it("sums the hero spans", () => {
    const r = computeForecast(base, DEFAULT_FORECAST);
    expect(r.hero.past6.revenue).toBe(3 * 400_000); // only 3 history months here
    expect(r.hero.next12.orders).toBeCloseTo(r.points.slice(3, 15).reduce((a, p) => a + p.orders, 0));
    expect(r.hero.next6.customers).toBeCloseTo(r.points[8]!.customers);
  });

  it("forecasts to December of next year", () => {
    expect(fiscalHorizon("2026-09-01")).toBe(15);
    expect(fiscalHorizon("2025-12-01")).toBe(24);
    const r = computeForecast(base, DEFAULT_FORECAST);
    expect(r.points.at(-1)!.month).toBe("2027-12-01");
  });

  it("counts the current month as its actuals so far plus the forecast for the remaining days", () => {
    const current = { orders: 300, revenue: 330_000, units: 9000, lines: 7000, new: 6, saved: 5, churned: 7, wonBack: 3 };
    const withCurrent: ForecastBase = {
      ...base,
      current: { month: "2026-10-01", elapsed_days: 20, days_in_month: 31 },
      cells: base.cells.map((c, i) => ({ ...c, current: i ? { ...current, orders: 0, revenue: 0, units: 0, lines: 0 } : current })),
    };
    const plain = computeForecast(base, DEFAULT_FORECAST, 1).points[3]!;
    const f = computeForecast(withCurrent, DEFAULT_FORECAST, 1).points[3]!;
    const rest = 11 / 31;
    expect(f.actual?.orders).toBe(300);
    expect(f.new).toBeCloseTo(12 + plain.new * rest);
    expect(f.churned).toBeCloseTo(14 + plain.churned * rest);
    expect(f.customers).toBeCloseTo(200 + f.new + f.wonBack - f.churned);
    expect(f.orders).toBeCloseTo(300 + f.customers * 2 * rest);
    expect(f.revenue).toBeCloseTo(330_000 + f.customers * 2 * rest * 1000);
    expect(f.aov).toBeCloseTo(f.revenue / f.orders);
  });

  it("sums the fiscal years: actual so far plus the rest", () => {
    const r = computeForecast(base, DEFAULT_FORECAST);
    const [fy26, fy27] = r.fiscal;
    expect(fy26!.year).toBe(2026);
    expect(fy26!.actual.revenue).toBe(3 * 400_000); // Jul-Sep in the history
    expect(fy26!.total.revenue).toBeCloseTo(r.points.filter((p) => p.month.startsWith("2026")).reduce((a, p) => a + p.revenue, 0));
    expect(fy26!.actual.revenue + fy26!.rest.revenue).toBeCloseTo(fy26!.total.revenue);
    expect(fy26!.total.customers).toBeCloseTo(r.points.find((p) => p.month === "2026-12-01")!.customers);
    expect(fy27!.actual.revenue).toBe(0);
    expect(fy27!.total.customers).toBeCloseTo(r.points.at(-1)!.customers);
  });
});
