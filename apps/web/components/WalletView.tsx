"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
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
/** A count of items: whole numbers plain, otherwise one decimal. */
const count = (x: number) => (Math.abs(x - Math.round(x)) < 0.05 ? Math.round(x).toLocaleString("en-US") : x.toFixed(1));
/** How targets are set and read: any SKU per store (not capped by the catalog), catalog items per store, or penetration %. */
type Unit = "skus" | "items" | "pct";
const nulls = (n: number) => Array.from({ length: n }, (): number | null => null);
/** Department colors: the site's validated categorical slots, in group order; "Other" is neutral. */
const colorOf = (g: number, groups: string[]) => (g === groups.length - 1 ? "var(--neutral-tint)" : `var(--cat-${g + 1})`);

export function WalletView({ base }: Props) {
  const G = base?.groups.length ?? 0;
  const [settings, setSettings] = useState<WalletSettings>(() => ({
    ...DEFAULT_SETTINGS,
    priorities: ["must"],
    shortTerm: nulls(G),
    longTerm: nulls(G),
    basis: "skus",
    shortSkus: nulls(G),
    longSkus: nulls(G),
  }));
  const [showTable, setShowTable] = useState(false);
  const [unit, setUnitState] = useState<Unit>("skus");
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
  const setTarget = (which: "shortTerm" | "longTerm" | "shortSkus" | "longSkus", g: number, v: number | null) =>
    setSettings((s) => {
      const next = [...(s[which] ?? nulls(G))];
      next[g] = v;
      return { ...s, [which]: next };
    });
  const resetTargets = () => set({ shortTerm: nulls(G), longTerm: nulls(G), shortSkus: nulls(G), longSkus: nulls(G) });
  const setUnit = (u: Unit) => {
    setUnitState(u);
    set({ basis: u === "skus" ? "skus" : "catalog" });
  };
  const snaps: { key: string; label: string; sub: string; s: Snapshot }[] = [
    { key: "then", label: "12 months ago", sub: `90 days to ${base.then_as_of}`, s: result.then },
    { key: "today", label: "Today", sub: `90 days to ${base.as_of}`, s: result.today },
    { key: "short", label: "Short term", sub: "6 months", s: result.shortTerm },
    { key: "long", label: "Long term", sub: "12 months", s: result.longTerm },
  ];
  const groups = base.groups;
  const detail = (bar: number, g: number): [string, string][] => {
    const gp = result.groups[g]!;
    const snap = snaps[bar]!.s;
    const pen = snap.penetration[g]!;
    const N = gp.itemsPerStore;
    const added = bar >= 2 ? (pen - gp.today) * N : 0;
    const addedSkus = bar >= 2 ? snap.skus[g]! - gp.skusToday : 0;
    const rows: [string, string][] = [
      ["Per order", `${money(snap.aov[g]!)} (${((snap.aov[g]! / Math.max(1, sum(snap.aov))) * 100).toFixed(0)}% of the order)`],
    ];
    if (snap.aovAdded[g]! > 0) rows.push(["From new items", money(snap.aovAdded[g]!)]);
    if (!Number.isNaN(pen)) {
      rows.push(["Catalog items a store buys", `${count(pen * N)} of ${N.toFixed(0)} (${pct(pen)})${added > 0.05 ? `, +${count(added)}` : ""}`]);
      rows.push(["Best stores, catalog", `${count(gp.best * N)} items`]);
    }
    rows.push(["Any SKU a store buys", `${count(snap.skus[g]!)}${addedSkus > 0.05 ? ` (${count(gp.skusToday)} today + ${count(addedSkus)} new)` : ""}`]);
    rows.push(["Best stores", `${count(gp.skusBest)} SKUs`]);
    if (Number.isFinite(gp.coverage)) rows.push(["Catalog share of spend", `${pct(gp.coverage)} today`]);
    return rows;
  };

  return (
    <div className="wallet-view">
      <section className="intro">
        <h2>Wallet: what each order holds today, and what it could hold</h2>
        <p className="muted">
          Average order value by department for active stores, 12 months ago and today, and where it goes in 6 and 12 months if stores buy as many more SKUs
          (or catalog items) as you set below. Each store is compared with the best stores of its own kind that order as often.
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
                  new SKUs bring (the lighter part at the top of each color).
                </p>
              </div>
              <button type="button" className="linklike" onClick={() => setShowTable((v) => !v)}>
                {showTable ? "Show chart" : "Show table"}
              </button>
            </div>
            <Legend groups={groups} />
            {showTable ? <AovTable groups={groups} snaps={snaps} /> : <StackedBars groups={groups} snaps={snaps} detail={detail} />}
          </section>
        </>
      )}

      <section className="card-block">
        <div className="block-head wallet-chart-head">
          <div>
            <h3>How many items stores buy, and how many more</h3>
            <p className="muted">
              For each department: how many different SKUs the average active store buys from us (catalog or not) and how many of the catalog&apos;s items,
              against the best stores of its kind. Drag a slider to choose how many more the average store buys in 6 and 12 months; the dollars follow.{" "}
              {unit === "skus"
                ? "Any SKU is not capped by the catalog: the best stores show the room, and the slider goes past them."
                : "Catalog items and penetration count only the catalog's items (Items that count, above)."}
            </p>
          </div>
          <div className="segmented" role="group" aria-label="Set targets in">
            <button type="button" aria-pressed={unit === "skus"} onClick={() => setUnit("skus")}>
              Any SKU
            </button>
            <button type="button" aria-pressed={unit === "items"} onClick={() => setUnit("items")}>
              Catalog items
            </button>
            <button type="button" aria-pressed={unit === "pct"} onClick={() => setUnit("pct")}>
              Penetration %
            </button>
          </div>
        </div>
        <p className="wallet-marks muted" aria-hidden>
          On each slider: <span className="mark-key then" /> 12 months ago <span className="mark-key today" /> today <span className="mark-key best" /> best stores
          · double-click a slider to reset it
        </p>
        <div className="wallet-depts">
          {result.groups.map((gp, g) => {
            if (Number.isNaN(gp.today)) return null;
            const N = gp.itemsPerStore;
            const facts = [
              <div key="skus">
                <dt>Any SKU a store buys, catalog or not</dt>
                <dd>
                  <strong>{count(gp.skusToday)}</strong>
                  <span className="muted">
                    {" "}
                    today · {count(gp.skusThen)} a year ago · best stores <strong>{count(gp.skusBest)}</strong>
                  </span>
                </dd>
              </div>,
              <div key="items">
                <dt>Catalog items a store buys</dt>
                <dd>
                  <strong>{count(gp.today * N)}</strong>
                  <span className="muted">
                    {" "}
                    of {N.toFixed(0)} today ({pct(gp.today)}) · {count(gp.then * N)} a year ago · best stores <strong>{count(gp.best * N)}</strong>
                  </span>
                </dd>
              </div>,
            ];
            if (unit !== "skus") facts.reverse();
            const scale = (term: "short" | "long"): Scale => {
              if (unit === "skus") {
                const today = gp.skusToday;
                return {
                  max: Math.max(gp.skusMax, today + 1),
                  value: term === "short" ? gp.skusShort : gp.skusLong,
                  then: gp.skusThen,
                  today,
                  best: gp.skusBest,
                  level: (x) => `${count(x)} SKUs`,
                  step: (x) => plural(x - today, "SKU"),
                  reach: (x) => `→ ${count(x)} SKUs (best stores ${count(gp.skusBest)})`,
                  snap: (x) => today + Math.round(x - today),
                };
              }
              const value = term === "short" ? gp.shortTerm : gp.longTerm;
              if (unit === "items")
                return {
                  max: N,
                  value: value * N,
                  then: gp.then * N,
                  today: gp.today * N,
                  best: gp.best * N,
                  level: (x) => `${count(x)} items`,
                  step: (x) => plural(x - gp.today * N, "item"),
                  reach: (x) => `→ ${count(x)} of ${N.toFixed(0)} (${pct(N ? x / N : 0)})`,
                  snap: (x) => gp.today * N + Math.round(x - gp.today * N),
                };
              return {
                max: 1,
                value,
                then: gp.then,
                today: gp.today,
                best: gp.best,
                level: pct,
                step: (x) => `+${((x - gp.today) * 100).toFixed(1)} pts`,
                reach: (x) => `→ ${pct(x)} (${count(x * N)} items)`,
                snap: (x) => x,
              };
            };
            const change = (term: "short" | "long") => (v: number | null) => {
              if (unit === "skus") setTarget(term === "short" ? "shortSkus" : "longSkus", g, v);
              else setTarget(term === "short" ? "shortTerm" : "longTerm", g, v === null ? null : unit === "items" ? (N ? v / N : 0) : v);
            };
            const perUnit =
              unit === "skus"
                ? `+1 SKU per store ≈ ${short(gp.revenuePerSku)}`
                : unit === "items"
                  ? `+1 item per store ≈ ${short(N ? gp.revenuePerPoint / (0.01 * N) : 0)}`
                  : `+1 point ≈ ${short(gp.revenuePerPoint)}`;
            const stretch = (term: "short" | "long") => (unit === "skus" ? (term === "short" ? gp.skusShortGap : gp.skusLongGap) : term === "short" ? gp.shortGap : gp.longGap) > 1;
            return (
              <div className="wallet-dept" key={groups[g]}>
                <div className="wallet-dept-head">
                  <span className="swatch" style={{ background: colorOf(g, groups) }} aria-hidden />
                  <strong>{groups[g]}</strong>
                  <span className="muted">{N.toFixed(0)} catalog items in scope</span>
                  {!noMoney && <span className="muted wallet-per-point">{perUnit} a year</span>}
                </div>
                <dl className="wallet-facts">
                  {facts}
                  {!noMoney && Number.isFinite(gp.coverage) && (
                    <div>
                      <dt>Spend on catalog items</dt>
                      <dd>
                        <strong>{pct(gp.coverage)}</strong>
                        <span className="muted"> of the department; the rest is SKUs outside the catalog</span>
                      </dd>
                    </div>
                  )}
                </dl>
                <TargetSlider
                  label="Short term (6 months)"
                  scale={scale("short")}
                  stretch={stretch("short")}
                  gain={noMoney ? null : gp.shortRevenue}
                  profit={noMoney ? null : gp.shortProfit}
                  onChange={change("short")}
                />
                <TargetSlider
                  label="Long term (12 months)"
                  scale={scale("long")}
                  stretch={stretch("long")}
                  gain={noMoney ? null : gp.longRevenue}
                  profit={noMoney ? null : gp.longProfit}
                  onChange={change("long")}
                />
              </div>
            );
          })}
        </div>
        <p className="muted wallet-foot">
          Defaults close a third of the gap to the best stores in 6 months and two thirds in 12.{" "}
          {unit === "skus" ? (
            <>
              Each store closes the same share of its own gap to the best stores of its kind, counting every SKU, catalog or not. An extra SKU is worth what an
              added catalog item is worth on average (every catalog item counting): what similar stores already buying it spend on it in a year
              {settings.reality ? ", less the share that comes out of what the store already buys (reality check on)" : ""}. Past the best stores is a stretch, up
              to twice the gap.
            </>
          ) : (
            <>
              A store adds the missing items most similar stores already carry first; each new carrier is worth what similar stores already buying the item
              spend on it in a year
              {settings.reality ? ", less the share that comes out of items the store already buys from us (reality check on)" : ""}. Gap position {MAX_GAP} =
              every item at 100%.
            </>
          )}
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
function StackedBars({
  groups,
  snaps,
  detail,
}: {
  groups: string[];
  snaps: { key: string; label: string; sub: string; s: Snapshot }[];
  detail: (bar: number, g: number) => [string, string][];
}) {
  const [hover, setHover] = useState<{ bar: number; g: number; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const W = 1000;
  const H = 340;
  const top = 28;
  const bottom = 44;
  const plotH = H - top - bottom;
  const max = Math.max(...snaps.map((x) => sum(x.s.aov)), 1);
  const step = niceStep(max / 4);
  const nice = Math.ceil(max / step) * step;
  const left = 56;
  const slot = (W - left) / snaps.length;
  const barW = Math.min(150, slot * 0.55);
  const y = (v: number) => top + plotH - (v / nice) * plotH;
  const ticks = Array.from({ length: Math.round(nice / step) + 1 }, (_, i) => i * step);
  const track = (bar: number, g: number) => (e: React.MouseEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setHover({ bar, g, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const width = box.current?.clientWidth ?? 0;
  return (
    <div className="wallet-chart" ref={box} onMouseLeave={() => setHover(null)}>
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
                  <g key={g} opacity={dim} onMouseMove={track(b, g)}>
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
        <div
          className="wallet-tip"
          role="status"
          style={{
            left: hover.x,
            top: hover.y,
            transform: `translate(${hover.x > width / 2 ? "calc(-100% - 14px)" : "14px"}, -50%)`,
          }}
        >
          <div className="wallet-tip-head">
            <span className="swatch" style={{ background: colorOf(hover.g, groups) }} aria-hidden />
            <strong>{groups[hover.g]}</strong>
            <span className="muted">· {snaps[hover.bar]!.label}</span>
          </div>
          <dl>
            {detail(hover.bar, hover.g).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
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

/** A slider's scale in the unit shown: SKUs, catalog items or penetration. */
interface Scale {
  max: number;
  value: number;
  then: number;
  today: number;
  best: number;
  level: (x: number) => string;
  /** The increment from today, e.g. "+5 SKUs". */
  step: (x: number) => string;
  reach: (x: number) => string;
  /** Rounds a dragged value (whole SKUs or items from today). */
  snap: (x: number) => number;
}
const plural = (x: number, unit: string) => `+${count(x)} ${unit}${Math.abs(x - 1) < 0.05 ? "" : "s"}`;

function TargetSlider(props: {
  label: string;
  scale: Scale;
  stretch: boolean;
  gain: number | null;
  profit: number | null;
  onChange: (v: number | null) => void;
}) {
  const { label, scale: sc, stretch, gain, profit, onChange } = props;
  const pos = (x: number) => `${Math.min(100, Math.max(0, (sc.max ? x / sc.max : 0) * 100))}%`;
  const step = sc.step(sc.value);
  return (
    <div className={`wallet-slider${stretch ? " stretch" : ""}`}>
      <div className="wallet-slider-label">
        <span>{label}</span>
        <strong className="wallet-step">{step}</strong>
        <span className="muted">{sc.reach(sc.value)}</span>
        {stretch && <span className="stretch-tag">stretch</span>}
        {gain !== null && (
          <span className="muted wallet-gain">
            +{short(gain)} revenue, +{short(profit ?? 0)} profit a year
          </span>
        )}
      </div>
      <div className="wallet-track">
        <span className="mark then" style={{ left: pos(sc.then) }} title={`12 months ago: ${sc.level(sc.then)}`} />
        <span className="mark today" style={{ left: pos(sc.today) }} title={`Today: ${sc.level(sc.today)}`} />
        <span className="mark best" style={{ left: pos(sc.best) }} title={`Best stores: ${sc.level(sc.best)}`} />
        <span className="wallet-bubble" style={{ left: pos(sc.value) }} aria-hidden>
          {step}
        </span>
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round((sc.max ? sc.value / sc.max : 0) * 1000)}
          aria-label={`${label} target`}
          aria-valuetext={`${step}, ${sc.level(sc.value)}`}
          onChange={(e) => onChange(Math.min(sc.max, Math.max(sc.today, sc.snap((Number(e.target.value) / 1000) * sc.max))))}
          onDoubleClick={() => onChange(null)}
        />
      </div>
    </div>
  );
}
