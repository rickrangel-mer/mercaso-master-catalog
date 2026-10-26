"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { acquisitionRows } from "../lib/exportTables";
import { downloadCsv } from "./downloadCsv";
import { series, totalOf, valueAt, type AcquisitionBase, type Measure, type RepSeries } from "../lib/acquisition";

interface Props {
  base: AcquisitionBase | null;
}

const MEASURES: { id: Measure; label: string }[] = [
  { id: "stores", label: "Stores acquired" },
  { id: "rate", label: "Acquisition rate" },
  { id: "penetration", label: "Penetration" },
];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (start: string) => `${MONTH[Number(start.slice(5, 7)) - 1]} ${start.slice(2, 4)}`;
const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const fmt = (x: number, m: Measure) => (m === "stores" ? n0(x) : m === "rate" ? `${(x * 100).toFixed(2)}%` : `${(x * 100).toFixed(1)}%`);

export function AcquisitionView({ base }: Props) {
  const [measure, setMeasure] = useState<Measure>("stores");
  const [type, setType] = useState(-1);
  const [selected, setSelected] = useState(-1);
  const data = useMemo(() => (base ? series(base, type < 0 ? [] : [type]) : null), [base, type]);

  if (!base || !data) {
    return (
      <div className="wallet-view">
        <section className="screen-head">
          <h1 className="screen-title">Acquisition</h1>
          <p className="screen-finding">Stores acquired by rep, month by month, with the acquisition rate and penetration.</p>
        </section>
        <div className="empty-frame">
          <strong>No acquisition data in this build.</strong> Run <code>pnpm athena:export market-stores market-store-days</code> and{" "}
          <code>pnpm acquisition</code>, then build the site again.
        </div>
      </div>
    );
  }
  const months = base.months;
  const last = months.length - 1;
  const { reps, total } = data;
  const shown = selected >= 0 ? reps[selected]! : total;
  const acquiredAll = totalOf(total, "stores");
  const top = [...reps].filter((r) => r.name !== "Unassigned").sort((a, b) => totalOf(b, "stores") - totalOf(a, "stores"))[0];
  const best = months.reduce((b, _, m) => (total.acquired[m]! > total.acquired[b]! && !(base.partial && m === last) ? m : b), 0);
  const rows = reps.filter((r) => r.market >= 0.5);
  // Shade cells against the largest monthly value on screen (full months only).
  const full = base.partial ? last : months.length;
  const max = Math.max(...rows.flatMap((r) => Array.from({ length: full }, (_, m) => valueAt(r, m, measure))), 1e-9);
  const shade = (x: number) => Math.round(Math.min(1, x / max) * 70);

  return (
    <div className="wallet-view acquisition-view">
      <section className="screen-head">
        <h1 className="screen-title">Acquisition</h1>
        <p className="screen-finding">
          {n0(acquiredAll)} stores acquired from {monthLabel(months[0]!)} to {monthLabel(months[last]!)}
          {base.partial ? " (to date)" : ""}; {monthLabel(months[best]!)} was the best full month ({n0(total.acquired[best]!)})
          {top ? (
            <>
              , and {top.name} acquired the most ({n0(totalOf(top, "stores"))})
            </>
          ) : null}
          . Penetration went from {fmt(valueAt(total, 0, "penetration"), "penetration")} to <strong>{fmt(valueAt(total, last, "penetration"), "penetration")}</strong>.
        </p>
        <p className="screen-source">
          Acquired: first order in the month. Prospects at a month&apos;s start: the prospect list plus every store acquired that month or later. Penetration: stores
          active at the month&apos;s end (ordered in the 45 days before) ÷ the rep&apos;s market. As of {base.as_of}.
        </p>
      </section>

      <div className="wallet-controls" role="group" aria-label="Inputs">
        <div className="field">
          <span>Show</span>
          <div className="segmented" role="group" aria-label="Measure">
            {MEASURES.map((m) => (
              <button key={m.id} type="button" aria-pressed={measure === m.id} onClick={() => setMeasure(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Store type</span>
          <select value={type} onChange={(e) => setType(Number(e.target.value))}>
            <option value={-1}>All store types</option>
            {base.types.map((t, i) => (
              <option key={t} value={i}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="wallet-reset csv-button"
          onClick={() =>
            downloadCsv(
              `mercaso-acquisition-${type < 0 ? "all-types" : base.types[type]!.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`,
              acquisitionRows(base, reps, total),
            )
          }
        >
          Download CSV
        </button>
      </div>

      <section className="card-block">
        <div className="block-head wallet-chart-head">
          <div>
            <h2 className="section-heading">
              {MEASURES.find((m) => m.id === measure)!.label} by month · {shown.name}
            </h2>
            <p className="muted">
              {selected >= 0 ? "Click the rep again, or All reps, to see everyone." : "Click a rep in the table to see their months."}
              {base.partial ? ` ${monthLabel(months[last]!)} runs to ${base.as_of}, drawn lighter.` : ""}
            </p>
          </div>
        </div>
        <Columns s={shown} months={months} measure={measure} partial={base.partial} />
      </section>

      <section className="card-block">
        <h2 className="section-heading">By rep</h2>
        <div className="table-wrap acq-wrap">
          <table className="sku-table acq-table">
            <thead>
              <tr>
                <th scope="col">Rep</th>
                {months.map((m, i) => (
                  <th key={m} scope="col" className="num">
                    {monthLabel(m)}
                    {base.partial && i === last ? "*" : ""}
                  </th>
                ))}
                <th scope="col" className="num">
                  {measure === "penetration" ? "Change" : "Total"}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...rows.map((r) => ({ r, i: reps.indexOf(r) })), { r: total, i: -1 }].map(({ r, i }) => (
                <tr
                  key={r.name}
                  className={`clickable${selected === i ? " is-selected" : ""}${i < 0 ? " total-row" : ""}`}
                  onClick={() => setSelected(selected === i ? -1 : i)}
                >
                  <th scope="row">
                    {r.name}
                    <span className="muted acq-market"> {n0(r.market)} stores</span>
                  </th>
                  {months.map((m, k) => {
                    const v = valueAt(r, k, measure);
                    const pctShade = i < 0 ? 0 : shade(v);
                    return (
                      <td
                        key={m}
                        className="num"
                        style={pctShade ? { background: `color-mix(in srgb, var(--data) ${pctShade}%, transparent)`, color: pctShade > 45 ? "#fff" : undefined } : undefined}
                        title={`${r.name}, ${monthLabel(m)}: ${n0(r.acquired[k]!)} acquired of ${n0(r.prospectsStart[k]!)} prospects; ${n0(r.activeEnd[k]!)} active of ${n0(r.market)}`}
                      >
                        {fmt(v, measure)}
                      </td>
                    );
                  })}
                  <td className="num">
                    <strong>
                      {measure === "penetration"
                        ? `${valueAt(r, last, "penetration") >= valueAt(r, 0, "penetration") ? "+" : ""}${((valueAt(r, last, "penetration") - valueAt(r, 0, "penetration")) * 100).toFixed(1)} pts`
                        : fmt(totalOf(r, measure), measure)}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {base.partial && <p className="muted small">* {monthLabel(months[last]!)} to {base.as_of}.</p>}
      </section>
    </div>
  );
}

/** Monthly columns in the data hue, drawn at the container's real width; a partial month lighter. */
function Columns({ s, months, measure, partial }: { s: RepSeries; months: string[]; measure: Measure; partial: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = W < 640;
  const H = narrow ? 220 : 260;
  const top = 22;
  const bottom = 30;
  const left = narrow ? 40 : 52;
  const plotH = H - top - bottom;
  const vals = months.map((_, m) => valueAt(s, m, measure));
  const maxV = Math.max(...vals, 1e-9);
  const step = niceStep(maxV / 4, measure);
  const nice = Math.ceil(maxV / step) * step;
  const ticks = Array.from({ length: Math.round(nice / step) + 1 }, (_, i) => i * step);
  const slot = (W - left) / months.length;
  const barW = Math.min(44, slot * 0.62);
  const y = (v: number) => top + plotH - (v / nice) * plotH;
  const tick = (v: number) => (measure === "stores" ? n0(v) : `${(v * 100).toFixed(measure === "rate" ? 1 : 0)}%`);
  return (
    <div className="wallet-chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.name}: ${MEASURES.find((m) => m.id === measure)!.label} by month`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" className="axis">
              {tick(t)}
            </text>
          </g>
        ))}
        {vals.map((v, m) => {
          const cx = left + slot * m + slot / 2;
          const isPartial = partial && m === months.length - 1;
          return (
            <g key={months[m]}>
              <rect x={cx - barW / 2} y={y(v)} width={barW} height={Math.max(0, y(0) - y(v))} rx={2} fill="var(--data)" opacity={isPartial ? 0.45 : 1}>
                <title>{`${monthLabel(months[m]!)}: ${fmt(v, measure)}`}</title>
              </rect>
              {!narrow && (
                <text x={cx} y={y(v) - 6} textAnchor="middle" className="bar-value-label">
                  {fmt(v, measure)}
                </text>
              )}
              {(!narrow || m % 2 === 0) && (
                <text x={cx} y={H - bottom + 18} textAnchor="middle" className="axis">
                  {monthLabel(months[m]!)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** A round axis step at least x: whole stores, or 0.25/0.5/1/2.5/5 percentage points. */
function niceStep(x: number, measure: Measure): number {
  if (measure === "stores") {
    const p = 10 ** Math.floor(Math.log10(Math.max(x, 1)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= x && Number.isInteger(m * p)) return m * p;
    return 10 * p;
  }
  const p = 10 ** Math.floor(Math.log10(Math.max(x, 1e-6)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= x) return m * p;
  return 10 * p;
}
