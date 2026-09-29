"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { approvedSkuCount, coverageByDepartment, mustGaps, type SkuRow } from "../lib/table";
import { PRIORITY_LEVELS, type CatalogIndex, type Priority } from "../lib/tree";
import type { Tab } from "./Header";

interface Props {
  index: CatalogIndex;
  rows: SkuRow[];
  onTab: (t: Tab) => void;
  onJump: (id: string) => void;
}

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));
const fmt = (n: number) => n.toLocaleString("en-US");

export function Overview({ index, rows, onTab, onJump }: Props) {
  const { catalog } = index;
  const s = catalog.summary;
  const coverage = useMemo(() => coverageByDepartment(index), [index]);
  const gaps = useMemo(() => mustGaps(index), [index]);
  const approved = useMemo(() => approvedSkuCount(rows), [rows]);
  const covered = coverage.reduce((a, c) => a + c.covered, 0);
  const items = coverage.reduce((a, c) => a + c.items, 0);
  const noSku = rows.filter((r) => !r.sku).length;
  const byPriority = PRIORITY_LEVELS.map((p) => ({
    p,
    items: coverage.reduce((a, c) => a + c.byPriority[p].items, 0),
    covered: coverage.reduce((a, c) => a + c.byPriority[p].covered, 0),
  }));
  const must = byPriority[0]!;

  return (
    <div className="overview">
      <section className="intro">
        <h2>What a {catalog.name.toLowerCase()} should carry, and the Mercaso SKUs that fill it</h2>
        <p className="muted">
          {catalog.description} Priorities and penetration come from 12 months of Mercaso sales to California liquor stores.
        </p>
      </section>

      <section className="tiles" aria-label="Headline numbers">
        <Tile label="Catalog items" value={fmt(items)}>
          <span className="p-must">{s.by_priority.must} must</span> · <span className="p-should">{s.by_priority.should} should</span> ·{" "}
          <span className="p-nice">{s.by_priority.nice} nice</span>
        </Tile>
        <Tile label="Items with a Mercaso SKU" value={`${pct(covered, items)}%`}>
          {fmt(covered)} of {fmt(items)} items
        </Tile>
        <Tile label="Must-carry covered" value={`${must.covered} of ${must.items}`}>
          {pct(must.covered, must.items)}% of must items
        </Tile>
        <Tile label="Approved Mercaso SKUs" value={fmt(approved)}>
          {fmt(noSku)} items have no SKU yet
        </Tile>
      </section>

      <section className="card-block">
        <div className="block-head">
          <h3>Coverage by department</h3>
          <p className="muted">Share of each department&apos;s catalog items with an approved Mercaso SKU. Hover a bar for the priority split.</p>
        </div>
        <BarList
          rows={coverage.map((c) => ({
            key: c.label,
            label: c.label,
            tint: `var(--cat-${c.departmentIndex})`,
            value: pct(c.covered, c.items),
            caption: `${c.covered} of ${c.items}`,
            detail: PRIORITY_LEVELS.map((p) => ({ p, ...c.byPriority[p] })),
          }))}
        />
      </section>

      <div className="two-col">
        <section className="card-block">
          <div className="block-head">
            <h3>Coverage by priority</h3>
            <p className="muted">Must-carry items come first; most gaps are nice-to-have sizes Mercaso doesn&apos;t stock.</p>
          </div>
          <BarList
            rows={byPriority.map((b) => ({
              key: b.p,
              label: b.p[0]!.toUpperCase() + b.p.slice(1),
              labelClass: `p-${b.p}`,
              value: pct(b.covered, b.items),
              caption: `${b.covered} of ${b.items}`,
            }))}
          />
        </section>

        <section className="card-block">
          <div className="block-head">
            <h3>Must-carry items still open</h3>
            <p className="muted">{gaps.length === 0 ? "Every must item has an approved SKU." : "Must items without an approved Mercaso SKU."}</p>
          </div>
          <ul className="gap-list">
            {gaps.map((g) => (
              <li key={g.id}>
                <button type="button" className="linklike" onClick={() => onJump(g.id)}>
                  {g.path.split(" › ").slice(2).join(" › ")}
                </button>
                <span className="muted gap-path">{g.path.split(" › ").slice(0, 2).join(" › ")}</span>
                <span className="gap-why">{g.pending > 0 ? `${g.pending} proposed, awaiting approval` : "Not stocked by Mercaso"}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card-block how">
        <h3>How to use this site</h3>
        <ul>
          <li>
            <button type="button" className="linklike" onClick={() => onTab("chart")}>
              Catalog chart
            </button>{" "}
            — the catalog as a family tree: department, category, brand, flavor, size. Click a card to open it and see its Mercaso SKUs.
          </li>
          <li>
            <button type="button" className="linklike" onClick={() => onTab("table")}>
              SKU table
            </button>{" "}
            — every Mercaso SKU with its priority, penetration and slot, grouped like a pivot table. Filter, sort, and download as CSV.
          </li>
          <li>
            <strong>Penetration</strong> is the share of California liquor stores that bought the SKU from Mercaso in the last 12 months (and in the last 90 days).
          </li>
        </ul>
      </section>
    </div>
  );
}

function Tile({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      <div className="tile-sub muted">{children}</div>
    </div>
  );
}

interface BarRow {
  key: string;
  label: string;
  labelClass?: string;
  tint?: string;
  /** Percent, 0–100. */
  value: number;
  caption: string;
  detail?: { p: Priority; items: number; covered: number }[];
}

/** Horizontal percent bars: one series, value labeled at the end, hover tooltip with detail. */
function BarList({ rows }: { rows: BarRow[] }) {
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const hovered = rows.find((r) => r.key === hover?.key);
  return (
    <div className="bars" onMouseLeave={() => setHover(null)}>
      {rows.map((r) => (
        <div
          key={r.key}
          className="bar-row"
          onMouseMove={(e) => {
            const box = e.currentTarget.parentElement!.getBoundingClientRect();
            setHover({ key: r.key, x: e.clientX - box.left, y: e.clientY - box.top });
          }}
        >
          <span className={`bar-label ${r.labelClass ?? ""}`}>
            {r.tint && <span className="swatch" style={{ "--tint": r.tint } as CSSProperties} aria-hidden="true" />}
            {r.label}
          </span>
          <span className="bar-track" role="img" aria-label={`${r.label}: ${r.value}% (${r.caption})`}>
            <span className="bar-fill" style={{ width: `${Math.max(r.value, 1)}%` }} />
          </span>
          <span className="bar-value">
            <strong>{r.value}%</strong> <span className="muted">{r.caption}</span>
          </span>
        </div>
      ))}
      {hover && hovered && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 14, 9999), top: hover.y + 14 }} role="tooltip">
          <div className="tooltip-title">{hovered.label}</div>
          <div>
            {hovered.value}% covered · {hovered.caption}
          </div>
          {hovered.detail?.map((d) => (
            <div key={d.p}>
              <span className={`p-${d.p}`}>{d.p}</span> {d.covered} of {d.items}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
