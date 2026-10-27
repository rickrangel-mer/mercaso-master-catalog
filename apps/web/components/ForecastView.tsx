"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { forecastRows } from "../lib/exportTables";
import { computeForecast, DEFAULT_FORECAST, type Driver, type ForecastBase, type ForecastSettings, type MonthPoint } from "../lib/forecast";
import { downloadCsv } from "./downloadCsv";

interface Props {
  base: ForecastBase | null;
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTH[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const n1 = (x: number) => x.toFixed(1);
const money = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const short = (x: number) => (Math.abs(x) >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : Math.abs(x) >= 1e3 ? `$${Math.round(x / 1e3).toLocaleString("en-US")}K` : money(x));
const big = (x: number) => (Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(2)}M` : Math.abs(x) >= 1e4 ? `${Math.round(x / 1e3).toLocaleString("en-US")}K` : n0(x));
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const change = (now: number, was: number) => (was ? `${now >= was ? "+" : "−"}${Math.abs(((now - was) / was) * 100).toFixed(1)}%` : "–");

/** The assumptions the sliders move, with how each reads. */
const ASSUMPTIONS: { id: Driver; label: string; unit: (x: number) => string; money?: boolean }[] = [
  { id: "new", label: "New customers a month", unit: n0 },
  { id: "wonBack", label: "Won back a month", unit: n0 },
  { id: "atRisk", label: "At risk a month (45 days, no order)", unit: pct },
  { id: "saveRate", label: "Save rate", unit: pct },
  { id: "ordersPerCustomer", label: "Orders per customer a month", unit: (x) => x.toFixed(2) },
  { id: "aov", label: "Average order value", unit: money, money: true },
  { id: "unitsPerOrder", label: "Units per order", unit: n1 },
  { id: "linesPerOrder", label: "SKU lines per order", unit: n1 },
];

export function ForecastView({ base }: Props) {
  const [settings, setSettings] = useState<ForecastSettings>(DEFAULT_FORECAST);
  const deferred = useDeferredValue(settings);
  const result = useMemo(() => (base ? computeForecast(base, deferred) : null), [base, deferred]);

  if (!base || !result) {
    return (
      <div className="wallet-view">
        <section className="screen-head">
          <h1 className="screen-title">Forecast</h1>
          <p className="screen-finding">New customers, churn, saves, order size and the next 12 months.</p>
        </section>
        <div className="empty-frame">
          <strong>No forecast data in this build.</strong> Run <code>pnpm athena:export market-stores market-store-days forecast-store-months</code> and{" "}
          <code>pnpm forecast</code>, then build the site again.
        </div>
      </div>
    );
  }
  const noMoney = base.no_money === true;
  const set = (patch: Partial<ForecastSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const setAdjust = (d: Driver, v: number) => setSettings((s) => ({ ...s, adjust: { ...s.adjust, [d]: v } }));
  const H = base.months.length;
  const { points, hero, drivers } = result;
  const first = points[H]!.month;
  const last = points[points.length - 1]!.month;
  const series = (f: (p: MonthPoint) => number) => points.map(f);
  // Each assumption's forecast average without its own adjustment, for the slider's readout.
  const avgNext = (d: Driver) => drivers[d].slice(H).reduce((a, b) => a + b, 0) / (drivers[d].length - H);
  /** The slider for one assumption, shown above the chart it drives. */
  const slider = (id: Driver) => {
    const a = ASSUMPTIONS.find((x) => x.id === id)!;
    const adj = settings.adjust[id] ?? 0;
    const now = avgNext(id);
    const without = adj === -1 ? 0 : now / (1 + adj);
    return (
      <div className="forecast-assumption">
        <div className="forecast-assumption-label">
          <span>{a.label}</span>
          <span className="muted" title="Next 12 months' average: as forecast → with the adjustment">
            {a.unit(without)} → <strong>{a.unit(now)}</strong>
          </span>
        </div>
        <div className="forecast-assumption-control">
          <input
            type="range"
            min={-50}
            max={50}
            step={1}
            value={Math.round(adj * 100)}
            aria-label={`${a.label}: adjustment`}
            aria-valuetext={`${adj >= 0 ? "+" : ""}${Math.round(adj * 100)}%`}
            onChange={(e) => setAdjust(id, Number(e.target.value) / 100)}
            onDoubleClick={() => setAdjust(id, 0)}
          />
          <strong className="forecast-adj">
            {adj > 0 ? "+" : ""}
            {Math.round(adj * 100)}%
          </strong>
        </div>
      </div>
    );
  };

  return (
    <div className="wallet-view forecast-view">
      <section className="screen-head">
        <h1 className="screen-title">Forecast</h1>
        <p className="screen-finding">
          {noMoney ? (
            <>
              The next 12 months: {big(hero.next12.lines)} SKU lines ({change(hero.next12.lines, hero.past12.lines)} on the last 12) and {n0(hero.next12.customers)} customers by{" "}
              {monthLabel(last)} (today {n0(hero.past12.customers)}).
            </>
          ) : (
            <>
              The next 12 months: <strong>{short(hero.next12.revenue)}</strong> in sales ({change(hero.next12.revenue, hero.past12.revenue)} on the last 12) and{" "}
              {n0(hero.next12.customers)} customers by {monthLabel(last)} (today {n0(hero.past12.customers)}).
            </>
          )}
        </p>
        <p className="screen-source">
          History: the 12 months to {monthLabel(base.months[H - 1]!)}, every CA store. Forecast: {monthLabel(first)} to {monthLabel(last)}. A customer ordered in the last 90 days;
          saved = ordered again after 45 to 89 days; churned = reached 90 days; won back = ordered again after 90+ days.
        </p>
      </section>

      <div className="wallet-controls" role="group" aria-label="Inputs">
        <label className="field">
          <span>Store type</span>
          <select value={settings.types[0] ?? -1} onChange={(e) => set({ types: Number(e.target.value) < 0 ? [] : [Number(e.target.value)] })}>
            <option value={-1}>All store types</option>
            {base.types.map((t, i) => (
              <option key={t} value={i}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Rep</span>
          <select value={settings.reps[0] ?? -1} onChange={(e) => set({ reps: Number(e.target.value) < 0 ? [] : [Number(e.target.value)] })}>
            <option value={-1}>All reps</option>
            {base.reps.map((r, i) => (
              <option key={r} value={i}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Months follow</span>
          <div className="segmented" role="group" aria-label="Months follow">
            <button type="button" aria-pressed={settings.shape === "seasonal"} onClick={() => set({ shape: "seasonal" })}>
              Last year&apos;s pattern
            </button>
            <button type="button" aria-pressed={settings.shape === "linear"} onClick={() => set({ shape: "linear" })}>
              A straight line
            </button>
          </div>
        </div>
        <div className="field">
          <span>Starting from</span>
          <div className="segmented" role="group" aria-label="Starting from">
            <button type="button" aria-pressed={settings.level === "hold"} onClick={() => set({ level: "hold" })}>
              Today&apos;s level
            </button>
            <button type="button" aria-pressed={settings.level === "trend"} onClick={() => set({ level: "trend" })}>
              The trend continued
            </button>
          </div>
        </div>
        <button
          type="button"
          className="wallet-reset csv-button"
          onClick={() => downloadCsv(`mercaso-forecast-${new Date().toISOString().slice(0, 10)}.csv`, forecastRows(base, result))}
        >
          Download CSV
        </button>
        <button type="button" className="wallet-reset" onClick={() => set({ adjust: {} })}>
          Reset adjustments
        </button>
      </div>

      <div className="forecast-layout">
        <div className="forecast-main">
          <section className="card-block">
            <div className="block-head">
              <h2 className="section-heading">Customers</h2>
              <p className="muted">
                Bars and lines in <span className="new-key">blue</span> are the last 12 months; the lighter part after the dashed line is the forecast. The slider above
                a chart moves its assumption up or down; its numbers are the next 12 months' average before and after (140 new customers a month at +5% is 147; double-click to
                reset). The charts without one follow from the others.
              </p>
            </div>
            <div className="forecast-charts">
              <MonthChart title="New customers" control={slider("new")} points={points} H={H} values={series((p) => p.new)} fmt={n0} kind="bars" />
              <MonthChart title="Churned (reached 90 days without an order)" control={slider("atRisk")} points={points} H={H} values={series((p) => p.churned)} fmt={n0} kind="bars" />
              <MonthChart title="Save rate (saved ÷ saved + churned)" control={slider("saveRate")} points={points} H={H} values={series((p) => p.saveRate)} fmt={pct} kind="line" percent />
              <MonthChart title="Won back (ordered again after 90+ days)" control={slider("wonBack")} points={points} H={H} values={series((p) => p.wonBack)} fmt={n0} kind="bars" />
              <MonthChart title="Customers (ordered in the last 90 days), month end" points={points} H={H} values={series((p) => p.customers)} fmt={n0} kind="line" />
              <MonthChart title="Saved (ordered again after 45-89 days)" points={points} H={H} values={series((p) => p.saved)} fmt={n0} kind="bars" />
            </div>
          </section>

          <section className="card-block">
            <div className="block-head">
              <h2 className="section-heading">Orders</h2>
            </div>
            <div className="forecast-charts">
              {!noMoney && <MonthChart title="Average order value" control={slider("aov")} points={points} H={H} values={series((p) => p.aov)} fmt={money} kind="line" />}
              <MonthChart title="Orders" control={slider("ordersPerCustomer")} points={points} H={H} values={series((p) => p.orders)} fmt={n0} kind="bars" />
              <MonthChart title="Units per order" control={slider("unitsPerOrder")} points={points} H={H} values={series((p) => p.unitsPerOrder)} fmt={n1} kind="line" />
              <MonthChart title="SKU lines per order" control={slider("linesPerOrder")} points={points} H={H} values={series((p) => p.linesPerOrder)} fmt={n1} kind="line" />
              {!noMoney && <MonthChart title="Sales" points={points} H={H} values={series((p) => p.revenue)} fmt={short} kind="bars" />}
              <MonthChart title="SKU lines" points={points} H={H} values={series((p) => p.lines)} fmt={big} kind="bars" />
            </div>
          </section>

          <details className="wallet-method">
            <summary>How the forecast is made</summary>
            <p className="muted">
              Customers move each month by new + won back − churned (exact in the history). Churned = customers × the share going 45 days without an order × (1 − save rate);
              the rest of those at risk are saved. New and won-back customers, the at-risk share, the save rate, orders per customer, AOV, units and SKU lines per order are each
              forecast from their own last 12 months: a straight line is fitted to them, held at its last value (today&apos;s level) or continued (the trend), and each month
              takes the same calendar month&apos;s place against the line last year (last year&apos;s pattern) or not (a straight line). Then × (1 + the adjustment). Orders =
              customers × orders per customer; sales, units and SKU lines = orders × AOV, units and lines per order.
            </p>
          </details>
        </div>

        <aside className="forecast-hero" aria-label="Forecast totals">
          {!noMoney && <HeroCard label="Sales" next6={hero.next6.revenue} next12={hero.next12.revenue} past6={hero.past6.revenue} past12={hero.past12.revenue} fmt={short} />}
          <HeroCard label="SKU lines" next6={hero.next6.lines} next12={hero.next12.lines} past6={hero.past6.lines} past12={hero.past12.lines} fmt={big} />
          <HeroCard label="Units" next6={hero.next6.units} next12={hero.next12.units} past6={hero.past6.units} past12={hero.past12.units} fmt={big} />
          <HeroCard
            label="Customers"
            next6={hero.next6.customers}
            next12={hero.next12.customers}
            past6={hero.past12.customers}
            past12={hero.past12.customers}
            fmt={n0}
            stock
          />
          <HeroCard label="New customers" next6={hero.next6.new} next12={hero.next12.new} past6={hero.past6.new} past12={hero.past12.new} fmt={n0} />
        </aside>
      </div>
    </div>
  );
}

/** A forecast total for 6 and 12 months against the same span before (or, for a stock, against today). */
function HeroCard({ label, next6, next12, past6, past12, fmt, stock }: { label: string; next6: number; next12: number; past6: number; past12: number; fmt: (x: number) => string; stock?: boolean }) {
  return (
    <div className="hero-card">
      <div className="hero-label">{label}</div>
      <div className="hero-row">
        <span className="hero-span">{stock ? "In 12 months" : "Next 12 months"}</span>
        <span className="hero-value">{fmt(next12)}</span>
        <span className="hero-change">
          {change(next12, past12)} {stock ? "on today" : "on the last 12"}
        </span>
      </div>
      <div className="hero-row small">
        <span className="hero-span">{stock ? "In 6 months" : "Next 6 months"}</span>
        <span className="hero-value">{fmt(next6)}</span>
        <span className="hero-change">
          {change(next6, past6)} {stock ? "on today" : "on the last 6"}
        </span>
      </div>
    </div>
  );
}

/** Monthly history in the data hue and the forecast lighter, split by a dashed line; bars or a line. */
function MonthChart({
  title,
  control,
  points,
  H,
  values,
  fmt,
  kind,
  percent,
}: {
  title: string;
  /** The slider for the assumption this chart shows, if it has one. */
  control?: ReactNode;
  points: MonthPoint[];
  H: number;
  values: number[];
  fmt: (x: number) => string;
  kind: "bars" | "line";
  percent?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(520);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const Hh = 190;
  const top = 14;
  const bottom = 24;
  const left = 46;
  const plotH = Hh - top - bottom;
  const n = values.length;
  const slot = (W - left) / n;
  const lo = kind === "line" && !percent ? Math.min(...values) * 0.9 : 0;
  const hi = Math.max(...values, 1e-9);
  const step = niceStep((hi - lo) / 4);
  const floor = kind === "line" && !percent ? Math.floor(lo / step) * step : 0;
  const ceil = Math.ceil(hi / step) * step;
  const y = (v: number) => top + plotH - ((v - floor) / (ceil - floor || 1)) * plotH;
  const x = (i: number) => left + slot * i + slot / 2;
  const ticks = Array.from({ length: Math.round((ceil - floor) / step) + 1 }, (_, i) => floor + i * step);
  const split = left + slot * H;
  const path = (from: number, to: number) =>
    values
      .slice(from, to)
      .map((v, i) => `${i ? "L" : "M"}${x(from + i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");
  return (
    <div className="month-chart" ref={box} onMouseLeave={() => setHover(null)}>
      <div className="month-chart-title">
        <span>{title}</span>
        {hover !== null && (
          <span className="month-chart-read">
            {monthLabel(points[hover]!.month)}
            {points[hover]!.forecast ? " (forecast)" : ""}: <strong>{fmt(values[hover]!)}</strong>
          </span>
        )}
      </div>
      {control}
      <svg viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label={`${title}: the last 12 months and the next 12`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" className="axis">
              {fmt(t)}
            </text>
          </g>
        ))}
        <line x1={split} x2={split} y1={top - 6} y2={top + plotH} className="forecast-split" />
        <text x={split + 4} y={top + 2} className="axis">
          Forecast
        </text>
        {kind === "bars"
          ? values.map((v, i) => (
              <rect
                key={i}
                x={x(i) - Math.min(14, slot * 0.32)}
                y={y(v)}
                width={Math.min(28, slot * 0.64)}
                height={Math.max(0, y(floor) - y(v))}
                rx={2}
                className={i >= H ? "bar future" : "bar"}
                opacity={hover !== null && hover !== i ? 0.55 : 1}
              />
            ))
          : (
            <>
              <path d={path(0, H)} className="line" />
              <path d={path(H - 1, n)} className="line future" />
              {hover !== null && <circle cx={x(hover)} cy={y(values[hover]!)} r={3.5} className={hover >= H ? "dot future" : "dot"} />}
            </>
          )}
        {points.map((p, i) =>
          i % (W < 480 ? 3 : 2) === 0 ? (
            <text key={p.month} x={x(i)} y={Hh - 6} textAnchor="middle" className="axis">
              {monthLabel(p.month)}
            </text>
          ) : null,
        )}
        {points.map((_, i) => (
          <rect key={`h${i}`} x={left + slot * i} y={top} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
    </div>
  );
}

/** A round axis step (1, 2, 2.5 or 5 × a power of ten) at least as big as x. */
function niceStep(x: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(x, 1e-9)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= x) return m * p;
  return 10 * p;
}
