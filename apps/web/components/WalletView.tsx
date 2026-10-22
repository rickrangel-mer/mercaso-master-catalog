"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { computeWallet, DEFAULT_SETTINGS, MAX_GAP, type Snapshot, type WalletBase, type WalletPriority, type WalletSettings } from "../lib/wallet";

interface Props {
  base: WalletBase | null;
}

const PRIORITY_SETS: { label: string; value: WalletPriority[] }[] = [
  { label: "Must items", value: ["must"] },
  { label: "Must & should", value: ["must", "should"] },
  { label: "All items", value: ["must", "should", "nice"] },
];
const TOP_SHARES = [0.1, 0.25, 0.5];
const typeLabel = (t: string) => t || "No type set";
const money = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const short = (x: number) => (Math.abs(x) >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : Math.abs(x) >= 1e3 ? `$${Math.round(x / 1e3).toLocaleString("en-US")}K` : money(x));
const pct = (x: number) => (Number.isNaN(x) ? "–" : `${(x * 100).toFixed(1)}%`);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** Department colors: the site's validated categorical slots, in group order; "Other" is neutral. */
const colorOf = (g: number, groups: string[]) => (g === groups.length - 1 ? "var(--neutral-tint)" : `var(--cat-${g + 1})`);

export function WalletView({ base }: Props) {
  const G = base?.groups.length ?? 0;
  const [settings, setSettings] = useState<WalletSettings>(() => ({
    ...DEFAULT_SETTINGS,
    priorities: ["must"],
    shortTerm: Array.from({ length: G }, () => null),
    longTerm: Array.from({ length: G }, () => null),
  }));
  const [showTable, setShowTable] = useState(false);
  const deferred = useDeferredValue(settings);
  const result = useMemo(() => (base ? computeWallet(base, deferred) : null), [base, deferred]);
  const types = useMemo(() => (base ? [...new Set(base.stores.map((s) => s.type))].sort((a, b) => typeLabel(a).localeCompare(typeLabel(b))) : []), [base]);

  if (!base || !result) {
    return (
      <div className="wallet-view">
        <p className="muted">
          The wallet view is not in this build. Run <code>pnpm athena:export pricing wallet-stores wallet-store-dept wallet-store-skus lift-adopters</code> and{" "}
          <code>pnpm wallet</code>, then build the site again.
        </p>
      </div>
    );
  }
  const noMoney = base.no_money === true;
  const set = (patch: Partial<WalletSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const setTarget = (which: "shortTerm" | "longTerm", g: number, v: number | null) =>
    setSettings((s) => {
      const next = [...s[which]];
      next[g] = v;
      return { ...s, [which]: next };
    });
  const resetTargets = () => set({ shortTerm: Array.from({ length: G }, () => null), longTerm: Array.from({ length: G }, () => null) });
  const snaps: { key: string; label: string; sub: string; s: Snapshot }[] = [
    { key: "then", label: "12 months ago", sub: `90 days to ${base.then_as_of}`, s: result.then },
    { key: "today", label: "Today", sub: `90 days to ${base.as_of}`, s: result.today },
    { key: "short", label: "Short term", sub: "6 months", s: result.shortTerm },
    { key: "long", label: "Long term", sub: "12 months", s: result.longTerm },
  ];
  const groups = base.groups;

  return (
    <div className="wallet-view">
      <section className="intro">
        <h2>Wallet: what each order holds today, and what it could hold</h2>
        <p className="muted">
          Average order value by department for active stores, 12 months ago and today, and where it goes in 6 and 12 months if each department reaches the
          penetration you set below. Penetration is the share of a department&apos;s catalog items a store buys; each store is compared with the best stores of
          its own kind that order as often.
        </p>
      </section>

      <div className="wallet-controls" role="group" aria-label="Inputs">
        <label className="field">
          <span>Store type</span>
          <select value={settings.types[0] ?? "__all"} onChange={(e) => set({ types: e.target.value === "__all" ? [] : [e.target.value] })}>
            <option value="__all">All store types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Orders a year</span>
          <select value={settings.tiers[0] ?? -1} onChange={(e) => set({ tiers: Number(e.target.value) < 0 ? [] : [Number(e.target.value)] })}>
            <option value={-1}>Any</option>
            {base.tiers.map((t, i) => (
              <option key={t} value={i}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Items that count</span>
          <select
            value={PRIORITY_SETS.findIndex((p) => p.value.join() === settings.priorities.join())}
            onChange={(e) => {
              set({ priorities: PRIORITY_SETS[Number(e.target.value)]!.value });
              resetTargets();
            }}
          >
            {PRIORITY_SETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Active store: ordered in</span>
          <span className="with-unit">
            <input type="number" min={7} max={180} value={settings.activeDays} onChange={(e) => set({ activeDays: clamp(Number(e.target.value), 7, 180) })} />
            days
          </span>
        </label>
        <label className="field">
          <span>Item carried: bought in</span>
          <span className="with-unit">
            <input type="number" min={7} max={180} value={settings.itemDays} onChange={(e) => set({ itemDays: clamp(Number(e.target.value), 7, 180) })} />
            days
          </span>
        </label>
        <label className="field">
          <span>Best stores</span>
          <select value={settings.topShare} onChange={(e) => set({ topShare: Number(e.target.value) })}>
            {TOP_SHARES.map((t) => (
              <option key={t} value={t}>
                Top {t * 100}%
              </option>
            ))}
          </select>
        </label>
        <label className="field check">
          <input type="checkbox" checked={settings.reality} onChange={(e) => set({ reality: e.target.checked })} />
          <span>Reality check</span>
        </label>
        <button type="button" onClick={resetTargets}>
          Reset targets
        </button>
      </div>

      {noMoney ? (
        <p className="muted">Dollar figures are only in the priced file. Penetration and targets below still work.</p>
      ) : (
        <>
          <div className="tiles wallet-tiles">
            <Hero label="Yearly revenue" today={result.today.revenue} st={result.shortTerm.revenue} lt={result.longTerm.revenue} />
            <Hero label="Yearly gross profit" today={result.today.profit} st={result.shortTerm.profit} lt={result.longTerm.profit} />
            <Hero label="Average order value" today={sum(result.today.aov)} st={sum(result.shortTerm.aov)} lt={sum(result.longTerm.aov)} exact />
            <div className="tile">
              <div className="tile-label">Active stores in view</div>
              <div className="tile-value">{result.today.stores.toLocaleString("en-US")}</div>
              <div className="tile-sub muted">
                {result.then.stores.toLocaleString("en-US")} 12 months ago · {result.today.orders.toLocaleString("en-US")} orders in 90 days
              </div>
            </div>
          </div>

          <section className="card-block">
            <div className="block-head wallet-chart-head">
              <div>
                <h3>Average order value by department</h3>
                <p className="muted">
                  Dollars per order, from everything stores buy from us, catalog or not. Short and long term keep that and today&apos;s orders, and add what the
                  new catalog items bring (the lighter part at the top of each color).
                </p>
              </div>
              <button type="button" className="linklike" onClick={() => setShowTable((v) => !v)}>
                {showTable ? "Show chart" : "Show table"}
              </button>
            </div>
            <Legend groups={groups} />
            {showTable ? <AovTable groups={groups} snaps={snaps} /> : <StackedBars groups={groups} snaps={snaps} />}
          </section>
        </>
      )}

      <section className="card-block">
        <div className="block-head">
          <h3>Department penetration and targets</h3>
          <p className="muted">
            Drag the sliders to set where each department gets to in 6 and 12 months. The marks show 12 months ago, today and the best stores. Beyond the best
            stores is a stretch: every extra point there comes from items few stores carry. A department that is already high gains less per point, because the
            items left to add are less popular.
          </p>
        </div>
        <p className="wallet-marks muted" aria-hidden>
          <span className="mark-key then" /> 12 months ago <span className="mark-key today" /> today <span className="mark-key best" /> best stores
          · double-click a slider to reset it
        </p>
        <div className="wallet-depts">
          {result.groups.map((gp, g) =>
            Number.isNaN(gp.today) ? null : (
              <div className="wallet-dept" key={groups[g]}>
                <div className="wallet-dept-head">
                  <span className="swatch" style={{ background: colorOf(g, groups) }} aria-hidden />
                  <strong>{groups[g]}</strong>
                  <span className="muted">
                    {pct(gp.then)} → {pct(gp.today)} today · best stores {pct(gp.best)} · {gp.itemsPerStore.toFixed(0)} items in scope
                  </span>
                  {!noMoney && <span className="muted wallet-per-point">+1 point ≈ {short(gp.revenuePerPoint)} a year</span>}
                </div>
                <p className="muted wallet-breadth">
                  Any SKU, catalog or not: a store buys {gp.skusThen.toFixed(0)} → {gp.skusToday.toFixed(0)} different SKUs in 90 days · best stores{" "}
                  {gp.skusBest.toFixed(0)}
                  {!noMoney && Number.isFinite(gp.coverage) && <> · the catalog covers {pct(gp.coverage)} of what stores spend here</>}
                </p>
                <TargetSlider
                  label="Short term (6 months)"
                  value={gp.shortTerm}
                  then={gp.then}
                  today={gp.today}
                  best={gp.best}
                  stretch={gp.shortGap > 1}
                  gain={noMoney ? null : gp.shortRevenue}
                  profit={noMoney ? null : gp.shortProfit}
                  onChange={(v) => setTarget("shortTerm", g, v)}
                />
                <TargetSlider
                  label="Long term (12 months)"
                  value={gp.longTerm}
                  then={gp.then}
                  today={gp.today}
                  best={gp.best}
                  stretch={gp.longGap > 1}
                  gain={noMoney ? null : gp.longRevenue}
                  profit={noMoney ? null : gp.longProfit}
                  onChange={(v) => setTarget("longTerm", g, v)}
                />
              </div>
            ),
          )}
        </div>
        <p className="muted wallet-foot">
          Defaults close a third of the gap to the best stores in 6 months and two thirds in 12. A store adds the missing items most similar stores already carry
          first; each new carrier is worth what similar stores already buying the item spend on it in a year
          {settings.reality ? ", less the share that comes out of items the store already buys from us (reality check on)" : ""}. Gap position {MAX_GAP} = every item
          at 100%.
        </p>
      </section>
    </div>
  );
}

const clamp = (x: number, lo: number, hi: number) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : lo);

function Hero({ label, today, st, lt, exact }: { label: string; today: number; st: number; lt: number; exact?: boolean }) {
  const f = exact ? money : short;
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{f(lt)}</div>
      <div className="tile-sub">
        <span className="muted">Long term, </span>
        <strong>+{f(lt - today)}</strong>
        <span className="muted">
          {" "}
          ({today ? `+${(((lt - today) / today) * 100).toFixed(1)}%` : "–"}) · today {f(today)} · short term {f(st)}
        </span>
      </div>
    </div>
  );
}

function Legend({ groups }: { groups: string[] }) {
  return (
    <ul className="wallet-legend" aria-label="Departments">
      {groups.map((g, i) => (
        <li key={g}>
          <span className="swatch" style={{ background: colorOf(i, groups) }} aria-hidden />
          {g}
        </li>
      ))}
    </ul>
  );
}

/** Vertical stacked bars, one per snapshot; Beverage at the bottom. 2px surface gaps between segments. */
function StackedBars({ groups, snaps }: { groups: string[]; snaps: { key: string; label: string; sub: string; s: Snapshot }[] }) {
  const [hover, setHover] = useState<{ bar: number; g: number } | null>(null);
  const W = 640;
  const H = 300;
  const top = 28;
  const bottom = 44;
  const plotH = H - top - bottom;
  const max = Math.max(...snaps.map((x) => sum(x.s.aov)), 1);
  const step = niceStep(max / 4);
  const nice = Math.ceil(max / step) * step;
  const left = 56;
  const slot = (W - left) / snaps.length;
  const barW = Math.min(88, slot * 0.5);
  const y = (v: number) => top + plotH - (v / nice) * plotH;
  const ticks = Array.from({ length: Math.round(nice / step) + 1 }, (_, i) => i * step);
  return (
    <div className="wallet-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Average order value by department, four snapshots">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" className="axis">
              {money(t)}
            </text>
          </g>
        ))}
        {snaps.map((snap, b) => {
          const cx = left + slot * b + slot / 2;
          let acc = 0;
          const total = sum(snap.s.aov);
          return (
            <g key={snap.key}>
              {snap.s.aov.map((v, g) => {
                const y0 = y(acc);
                const yBase = y(acc + v - (snap.s.aovAdded[g] ?? 0));
                acc += v;
                const y1 = y(acc);
                const isTop = g === lastNonZero(snap.s.aov);
                const yTop = y1 + (isTop ? 0 : 2);
                if (y0 - yTop <= 0) return null;
                const dim = hover && (hover.bar !== b || hover.g !== g) ? 0.55 : 1;
                // What stores already buy in full color; the new items' part lighter on top.
                return (
                  <g key={g} opacity={dim} onMouseEnter={() => setHover({ bar: b, g })} onMouseLeave={() => setHover(null)}>
                    {yBase > yTop + 0.5 && (
                      <rect x={cx - barW / 2} y={yTop} width={barW} height={yBase - yTop} rx={isTop ? 4 : 0} fill={colorOf(g, groups)} fillOpacity={0.4} />
                    )}
                    <rect
                      x={cx - barW / 2}
                      y={Math.max(yTop, yBase)}
                      width={barW}
                      height={Math.max(0, y0 - Math.max(yTop, yBase))}
                      rx={isTop && yBase <= yTop + 0.5 ? 4 : 0}
                      fill={colorOf(g, groups)}
                    />
                  </g>
                );
              })}
              <text x={cx} y={y(total) - 8} textAnchor="middle" className="bar-total">
                {money(total)}
              </text>
              <text x={cx} y={H - bottom + 18} textAnchor="middle" className="bar-name">
                {snap.label}
              </text>
              <text x={cx} y={H - bottom + 34} textAnchor="middle" className="axis">
                {snap.sub}
              </text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="wallet-tip" role="status">
          <strong>{snaps[hover.bar]!.label}</strong> · {groups[hover.g]}: {money(snaps[hover.bar]!.s.aov[hover.g]!)} an order (
          {((snaps[hover.bar]!.s.aov[hover.g]! / Math.max(1, sum(snaps[hover.bar]!.s.aov))) * 100).toFixed(0)}% of the order)
          {snaps[hover.bar]!.s.aovAdded[hover.g]! > 0 && <>, of which new items {money(snaps[hover.bar]!.s.aovAdded[hover.g]!)}</>}
        </div>
      )}
    </div>
  );
}

const lastNonZero = (xs: number[]) => xs.reduce((last, v, i) => (v > 0 ? i : last), -1);
/** A round axis step (1, 2, 2.5 or 5 × a power of ten) at least as big as x. */
function niceStep(x: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(x, 1e-9)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= x) return m * p;
  return 10 * p;
}

function AovTable({ groups, snaps }: { groups: string[]; snaps: { key: string; label: string; s: Snapshot }[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Department</th>
            {snaps.map((s) => (
              <th key={s.key} scope="col" className="num">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={g}>
              <th scope="row">{g}</th>
              {snaps.map((s) => (
                <td key={s.key} className="num">
                  {money(s.s.aov[i]!)}
                  {s.s.aovAdded[i]! > 0 && <span className="muted"> (+{money(s.s.aovAdded[i]!)} new)</span>}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row">Average order value</th>
            {snaps.map((s) => (
              <td key={s.key} className="num">
                <strong>{money(sum(s.s.aov))}</strong>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function TargetSlider(props: {
  label: string;
  value: number;
  then: number;
  today: number;
  best: number;
  stretch: boolean;
  gain: number | null;
  profit: number | null;
  onChange: (v: number | null) => void;
}) {
  const { label, value, then, today, best, stretch, gain, profit, onChange } = props;
  const pos = (x: number) => `${Math.min(100, Math.max(0, x * 100))}%`;
  return (
    <div className={`wallet-slider${stretch ? " stretch" : ""}`}>
      <div className="wallet-slider-label">
        <span>{label}</span>
        <strong>{pct(value)}</strong>
        {stretch && <span className="stretch-tag">stretch</span>}
        {gain !== null && (
          <span className="muted">
            +{short(gain)} revenue, +{short(profit ?? 0)} profit a year
          </span>
        )}
      </div>
      <div className="wallet-track">
        <span className="mark then" style={{ left: pos(then) }} title={`12 months ago: ${pct(then)}`} />
        <span className="mark today" style={{ left: pos(today) }} title={`Today: ${pct(today)}`} />
        <span className="mark best" style={{ left: pos(best) }} title={`Best stores: ${pct(best)}`} />
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(value * 1000)}
          aria-label={`${label} target`}
          aria-valuetext={pct(value)}
          onChange={(e) => onChange(Math.max(today, Number(e.target.value) / 1000))}
          onDoubleClick={() => onChange(null)}
        />
      </div>
    </div>
  );
}
