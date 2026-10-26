"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { marketRows } from "../lib/exportTables";
import { downloadCsv } from "./downloadCsv";
import { computeMarket, defaults, DIMS, groupNames, type Dim, type GroupResult, type MarketBase, type MarketSettings } from "../lib/market";

interface Props {
  base: MarketBase | null;
}

const DIM_LABEL: Record<Dim, string> = { zone: "Zone", area: "Sub-area", type: "Store type", rep: "Rep" };
const DIM_PLURAL: Record<Dim, string> = { zone: "zone", area: "sub-area", type: "store type", rep: "rep" };
type Metric = "penetration" | "stores" | "revenue";
type Horizon = "short" | "long";

const money = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const short = (x: number) => (Math.abs(x) >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : Math.abs(x) >= 1e3 ? `$${Math.round(x / 1e3).toLocaleString("en-US")}K` : money(x));
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const nulls = (n: number) => Array.from({ length: n }, (): number | null => null);
const blank = (base: MarketBase, driver: Dim): Pick<MarketSettings, "newShort" | "newLong" | "backShort" | "backLong"> => {
  const n = groupNames(base, driver).length;
  return { newShort: nulls(n), newLong: nulls(n), backShort: nulls(n), backLong: nulls(n) };
};

export function MarketView({ base }: Props) {
  const [settings, setSettings] = useState<MarketSettings | null>(() => (base ? { driver: "zone", spend: "average", ...blank(base, "zone") } : null));
  const [horizon, setHorizon] = useState<Horizon>("long");
  const [metric, setMetric] = useState<Metric>("penetration");
  // The file arrives after the first render on the live site.
  const set = settings ?? (base ? { driver: "zone" as Dim, spend: "average" as const, ...blank(base, "zone") } : null);
  const deferred = useDeferredValue(set);
  const result = useMemo(() => (base && deferred ? computeMarket(base, deferred) : null), [base, deferred]);

  if (!base || !set || !result) {
    return (
      <div className="wallet-view">
        <section className="screen-head">
          <h1 className="screen-title">Market</h1>
          <p className="screen-finding">How much of the market&apos;s stores buy from us, by zone, sub-area, store type and rep.</p>
        </section>
        <div className="empty-frame">
          <strong>No market data in this build.</strong> Run <code>pnpm athena:export market-stores market-zips</code> and <code>pnpm market</code>, then build
          the site again.
        </div>
      </div>
    );
  }
  const noMoney = base.no_money === true;
  const update = (patch: Partial<MarketSettings>) => setSettings({ ...set, ...patch });
  const setDriver = (driver: Dim) => update({ driver, ...blank(base, driver) });
  const reset = () => update(blank(base, set.driver));
  const setTarget = (key: "newShort" | "newLong" | "backShort" | "backLong", i: number, v: number | null) => {
    const next = [...set[key]];
    next[i] = v;
    update({ [key]: next });
  };
  const { total } = result;
  const driving = result.groups[set.driver];
  const served = (g: GroupResult, h: "today" | Horizon) => g.active + (h === "today" ? 0 : h === "short" ? g.newShort + g.backShort : g.newLong + g.backLong);
  const lead = [...driving].sort((a, b) => b.revenueLong - a.revenueLong)[0];

  return (
    <div className="wallet-view market-view">
      <section className="screen-head">
        <h1 className="screen-title">Market</h1>
        <p className="screen-finding">
          We serve {n0(total.active)} of {n0(total.market)} stores ({pct(total.today)}). At these targets that is <strong>{pct(total.long)}</strong> in 12 months: +
          {n0(total.newLong)} new stores and +{n0(total.backLong)} won back
          {!noMoney && <>, +{short(total.revenueLong)} a year</>}
          {lead && lead.newLong + lead.backLong > 0.5 && (
            <>
              ; {lead.name} adds the most{!noMoney && <>, +{short(lead.revenueLong)}</>}
            </>
          )}
          .
        </p>
        <p className="screen-source">
          Market: active stores (ordered in the last 45 days), stores that stopped ordering in the last 12 months, and the prospect list
          {set.withPlaces ? `, plus ${n0(base.places_prospects ?? 0)} places from the Google Places scrape that are new to us` : ""}. As of {base.as_of}.
        </p>
      </section>

      <div className="wallet-controls" role="group" aria-label="Inputs">
        <div className="field">
          <span>Set targets by</span>
          <div className="segmented" role="group" aria-label="Set targets by">
            {DIMS.map((d) => (
              <button key={d} type="button" aria-pressed={set.driver === d} onClick={() => setDriver(d)}>
                {DIM_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
        {(base.places_prospects ?? 0) > 0 && (
          <label className="field">
            <span>Prospects</span>
            <select value={set.withPlaces ? "places" : "list"} onChange={(e) => update({ withPlaces: e.target.value === "places" })}>
              <option value="list">Sales prospect list</option>
              <option value="places">List + Google Places scrape (+{n0(base.places_prospects ?? 0)})</option>
            </select>
          </label>
        )}
        {!noMoney && (
          <label className="field">
            <span>A new store spends</span>
            <select value={set.spend} onChange={(e) => update({ spend: e.target.value as MarketSettings["spend"] })}>
              <option value="average">Like the average store of its type</option>
              <option value="typical">Like the typical (median) store</option>
            </select>
          </label>
        )}
        <button
          type="button"
          className="wallet-reset csv-button"
          onClick={() => downloadCsv(`mercaso-market-by-${set.driver}-${new Date().toISOString().slice(0, 10)}.csv`, marketRows(base, result))}
        >
          Download CSV
        </button>
        <button type="button" className="wallet-reset" onClick={reset}>
          Reset targets
        </button>
      </div>

      <dl className="wallet-strip">
        <div className="lead">
          <dt>Market penetration in 12 months</dt>
          <dd>
            <span className="value">{pct(total.long)}</span>
            <span className="sub">
              +{((total.long - total.today) * 100).toFixed(1)} pts on today&apos;s {pct(total.today)} · 6 months {pct(total.short)}
            </span>
          </dd>
        </div>
        <div>
          <dt>Stores served in 12 months</dt>
          <dd>
            <span className="value">{n0(served(total, "long"))}</span>
            <span className="sub">
              +{n0(total.newLong)} new, +{n0(total.backLong)} won back on today&apos;s {n0(total.active)}
            </span>
          </dd>
        </div>
        {!noMoney && (
          <>
            <div>
              <dt>Yearly revenue in 12 months</dt>
              <dd>
                <span className="value">{short(total.revenue + total.revenueLong)}</span>
                <span className="sub">
                  +{short(total.revenueLong)} on today&apos;s {short(total.revenue)} · 6 months +{short(total.revenueShort)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Yearly gross profit in 12 months</dt>
              <dd>
                <span className="value">{short(total.profit + total.profitLong)}</span>
                <span className="sub">
                  +{short(total.profitLong)} on today&apos;s {short(total.profit)}
                </span>
              </dd>
            </div>
          </>
        )}
      </dl>

      <section className="card-block">
        <div className="block-head wallet-chart-head">
          <div>
            <h2 className="section-heading">Targets by {DIM_PLURAL[set.driver]}</h2>
            <p className="muted">
              New stores come from the prospect list, win-backs from stores that stopped ordering in the last 12 months. Defaults: new stores at last
              year&apos;s pace, no win-backs.
            </p>
          </div>
          <div className="segmented" role="group" aria-label="Horizon">
            <button type="button" aria-pressed={horizon === "short"} onClick={() => setHorizon("short")}>
              6 months
            </button>
            <button type="button" aria-pressed={horizon === "long"} onClick={() => setHorizon("long")}>
              12 months
            </button>
          </div>
        </div>
        <p className="wallet-marks muted" aria-hidden>
          <span className="mark-key today" /> last year&apos;s pace <span className="mark-key target" /> stores won · double-click a slider to reset it
        </p>
        <div className="market-targets">
          {driving.map((g, i) => {
            if (g.market < 0.5) return null;
            const d = defaults(g);
            const nKey = horizon === "short" ? "newShort" : "newLong";
            const bKey = horizon === "short" ? "backShort" : "backLong";
            const nVal = horizon === "short" ? g.newShort : g.newLong;
            const bVal = horizon === "short" ? g.backShort : g.backLong;
            const pace = horizon === "short" ? d.newShort : d.newLong;
            const after = horizon === "short" ? g.short : g.long;
            const gain = horizon === "short" ? g.revenueShort : g.revenueLong;
            return (
              <div className="market-row" key={g.name}>
                <div className="market-row-head">
                  <strong>{g.name}</strong>
                  <span className="muted">
                    {n0(g.active)} of {n0(g.market)} stores · {pct(g.today)}
                  </span>
                  <span className="market-row-result">
                    → <strong>{pct(after)}</strong>
                    {!noMoney && <span className="muted"> · +{short(gain)} a year</span>}
                  </span>
                </div>
                <CountSlider
                  label="New stores"
                  value={nVal}
                  max={g.prospects}
                  mark={pace}
                  of={`of ${n0(g.prospects)} prospects`}
                  onChange={(v) => setTarget(nKey, i, v)}
                />
                <CountSlider
                  label="Won back"
                  value={bVal}
                  max={g.churned}
                  of={`of ${n0(g.churned)} stopped ordering`}
                  onChange={(v) => setTarget(bKey, i, v)}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section className="card-block">
        <div className="block-head wallet-chart-head">
          <div>
            <h2 className="section-heading">Where the stores land</h2>
            <p className="muted">
              Grey is today; <span className="new-key">blue</span> is what the targets add in 6 months, and the lighter blue what they add by 12 months. The
              targets are set by {DIM_PLURAL[set.driver]}; the other charts show where those stores are.
            </p>
          </div>
          <div className="segmented" role="group" aria-label="Measure">
            <button type="button" aria-pressed={metric === "penetration"} onClick={() => setMetric("penetration")}>
              Penetration
            </button>
            <button type="button" aria-pressed={metric === "stores"} onClick={() => setMetric("stores")}>
              Stores
            </button>
            {!noMoney && (
              <button type="button" aria-pressed={metric === "revenue"} onClick={() => setMetric("revenue")}>
                Revenue
              </button>
            )}
          </div>
        </div>
        <div className="market-charts">
          {(["zone", "type", "area", "rep"] as Dim[]).map((d) => (
            <BarList
              key={d}
              title={`By ${DIM_PLURAL[d]}`}
              driving={d === set.driver}
              groups={result.groups[d]}
              zones={d === "area" ? base.zones : undefined}
              metric={metric}
              noMoney={noMoney}
            />
          ))}
        </div>
      </section>

      <details className="wallet-method">
        <summary>How the numbers are made</summary>
        <p className="muted">
          The market is every store that is active (ordered in the last 45 days), stopped ordering in the last 12 months, or is on the prospect list; penetration
          is active stores ÷ the market. Zones group Mercaso&apos;s map regions (the sub-areas, edited in data/market/zones.yaml); a store or prospect takes the
          region of its ZIP. Reps come from the prospect list; a customer takes the rep who owns its ZIP. Prospects with no ZIP and customers outside every rep&apos;s
          ZIPs are Unassigned. A {DIM_PLURAL[set.driver]}&apos;s new stores are spread over its stores by prospects, and its win-backs by stopped stores. A new store
          spends what today&apos;s active stores of its type spend, in today&apos;s mix of how often stores order; a won-back store returns with the business it
          had in its last year (giants capped). Figures are yearly, once the stores are ordering.
        </p>
      </details>
    </div>
  );
}

/** A store-count slider from 0 to the stores there are, moving one store at a time. */
function CountSlider({ label, value, max, mark, of, onChange }: { label: string; value: number; max: number; mark?: number; of: string; onChange: (v: number | null) => void }) {
  const pos = (x: number) => `${max ? Math.min(100, (x / max) * 100) : 0}%`;
  const step = `+${n0(value)}`;
  return (
    <div className="wallet-slider">
      <div className="wallet-slider-label">
        <span>{label}</span>
        <strong className="wallet-step">{step}</strong>
        <span className="muted market-of">{of}</span>
      </div>
      <div className="wallet-track">
        {mark !== undefined && mark > 0 && <span className="mark today" style={{ left: pos(mark) }} title={`Last year's pace: ${n0(mark)}`} />}
        <span className="wallet-bubble" style={{ left: pos(value) }} aria-hidden>
          {step}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(max))}
          step={1}
          value={Math.round(value)}
          disabled={max < 1}
          aria-label={`${label}`}
          aria-valuetext={`${step} ${of}`}
          onChange={(e) => onChange(Number(e.target.value))}
          onDoubleClick={() => onChange(null)}
        />
      </div>
    </div>
  );
}

/** Horizontal bars per group: today in grey, the 6-month gain in blue, the 12-month gain in light blue. */
function BarList({ title, driving, groups, zones, metric, noMoney }: { title: string; driving: boolean; groups: GroupResult[]; zones?: string[] | undefined; metric: Metric; noMoney: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  const val = (g: GroupResult, h: "today" | Horizon) => {
    if (metric === "penetration") return h === "today" ? g.today : h === "short" ? g.short : g.long;
    if (metric === "stores") return g.active + (h === "today" ? 0 : h === "short" ? g.newShort + g.backShort : g.newLong + g.backLong);
    return g.revenue + (h === "today" ? 0 : h === "short" ? g.revenueShort : g.revenueLong);
  };
  const fmt = (x: number) => (metric === "penetration" ? pct(x) : metric === "stores" ? n0(x) : short(x));
  const shown = groups.map((g, i) => ({ g, i })).filter(({ g }) => g.market >= 0.5);
  const max = Math.max(...shown.map(({ g }) => val(g, "long")), 1e-9);
  const w = (x: number) => `${Math.max(0, (x / max) * 100)}%`;
  const rows = (list: typeof shown) =>
    list.map(({ g }) => {
      const t = val(g, "today");
      const s = val(g, "short");
      const l = val(g, "long");
      return (
        <div className="market-bar" key={g.name} onMouseEnter={() => setHover(g.name)} onMouseLeave={() => setHover(null)}>
          <span className="market-bar-label" title={g.name}>
            {g.name}
          </span>
          <span className="market-bar-track" role="img" aria-label={`${g.name}: ${fmt(t)} today, ${fmt(s)} in 6 months, ${fmt(l)} in 12 months`}>
            <span className="seg today" style={{ width: w(t) }} />
            <span className="seg short" style={{ width: w(s - t) }} />
            <span className="seg long" style={{ width: w(l - s) }} />
          </span>
          <span className="market-bar-value">
            {fmt(t)} → <strong>{fmt(l)}</strong>
          </span>
          {hover === g.name && (
            <span className="market-bar-tip" role="status">
              {n0(g.active)} active of {n0(g.market)} · {n0(g.prospects)} prospects · {n0(g.churned)} stopped · 12 months: +{n0(g.newLong)} new, +{n0(g.backLong)} back
              {!noMoney && <> · +{short(g.revenueLong)} a year</>}
            </span>
          )}
        </div>
      );
    });
  return (
    <div className={`market-chart${driving ? " driving" : ""}`}>
      <h3 className="market-chart-title">
        {title}
        {driving && <span className="market-driving">sets the targets</span>}
      </h3>
      {zones
        ? zones.map((z, zi) => {
            const list = shown.filter(({ g }) => g.zone === zi);
            if (!list.length) return null;
            return (
              <div key={z} className="market-group">
                <div className="market-group-name">{z}</div>
                {rows(list)}
              </div>
            );
          })
        : rows(shown)}
    </div>
  );
}
