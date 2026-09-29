"use client";

import type { ReactNode } from "react";
import { isLeaf, KIND_LABEL, type CatalogIndex, type ViewNode } from "../lib/tree";

interface Props {
  node: ViewNode | null;
  index: CatalogIndex | null;
  onJump: (id: string) => void;
}

export function DetailPanel({ node, index, onJump }: Props) {
  if (!node || !index) {
    return (
      <aside className="detail" aria-label="Node details">
        <p className="muted">Select a node to see its details. Click a branch to open or close it.</p>
        <Legend />
      </aside>
    );
  }

  const d = node.data;
  const a = d?.attrs ?? {};
  const roll = index.rollup.get(node.id);
  const rows: [string, ReactNode][] = [];
  const add = (label: string, value: ReactNode | undefined | false) => {
    if (value !== undefined && value !== false && value !== "") rows.push([label, value]);
  };

  add("Kind", KIND_LABEL[node.kind]);
  if (d?.priority) {
    // On a branch the priority is only the default its leaves inherit; the rollup below is the real mix.
    add(
      isLeaf(node) ? "Priority" : "Default priority",
      <span className={`pill p-${d.priority}`}>
        {d.priority}
        {d.priority_source === "inherited" ? " (inherited)" : ""}
      </span>,
    );
  }
  add("Size class", Array.isArray(a.size_class) ? a.size_class.join(", ") : a.size_class);
  add("Container", a.container);
  add("Volume", a.volume_ml !== undefined && `${a.volume_ml} ml`);
  add("Unit count", a.unit_count);
  add("Target", a.target_count && (a.target_count.min === a.target_count.max ? `${a.target_count.min}` : `${a.target_count.min}–${a.target_count.max}`) + " SKUs");
  add("Mix", a.mix?.join(", "));
  add("Brand hints", a.brand_hints?.join(", "));
  add("Size classes", a.size_classes && Object.entries(a.size_classes).map(([k, v]) => `${k}: ${v}`).join("; "));
  add("Needs data check", a.verify && (a.verify === "sales" ? "Sales cross-check" : "Stock check"));
  add("Age restricted", a.age_restricted && "Yes");
  add("Restricted in", a.restricted?.join(", "));

  return (
    <aside className="detail" aria-label="Node details">
      <h2 className="detail-title">{node.name}</h2>
      {d && <p className="mono muted">{d.id}</p>}
      <dl className="props">
        {rows.map(([k, v]) => (
          <div key={k} className="prop">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {d?.note && <p className="note">{d.note}</p>}
      {d?.store_note && <p className="note store-note">{d.store_note}</p>}
      {a.cross_ref && (
        <div className="section">
          <h3>Points to</h3>
          <ul className="refs">
            {a.cross_ref.map((ref) => (
              <li key={ref}>
                <button type="button" className="linklike" onClick={() => onJump(ref)}>
                  {index.byId.get(ref)?.name ?? ref}
                </button>{" "}
                <span className="mono muted">{ref}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {isLeaf(node) && d?.match && (
        <div className="section">
          <h3>Mercaso match</h3>
          <p>
            <span className={`pill status-${d.match.status}`}>{d.match.status}</span> {d.match.approved} approved,{" "}
            {d.match.pending} pending
          </p>
          {d.match.skus.length > 0 ? (
            <ul className="skus">
              {d.match.skus.map((s) => (
                <li key={`${s.sku}-${s.case_pack ?? ""}`} className="mono">
                  {s.sku} {s.case_pack ? `· case ${s.case_pack}` : ""} · {s.status}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No SKUs matched yet (Phase 4).</p>
          )}
        </div>
      )}
      {!isLeaf(node) && roll && roll.leaves > 0 && (
        <div className="section">
          <h3>Leaves below</h3>
          <p>
            {roll.leaves} total · <span className="p-must">{roll.must} must</span> ·{" "}
            <span className="p-should">{roll.should} should</span> · <span className="p-nice">{roll.nice} nice</span> ·{" "}
            {roll.gap} gaps
          </p>
        </div>
      )}
      <Legend />
    </aside>
  );
}

function Legend() {
  return (
    <div className="legend section">
      <h3>Legend</h3>
      <svg width="290" height="96" aria-hidden="true">
        <g transform="translate(8,12)">
          <circle className="legend-must" r={4.5} />
          <text x={12} dy="0.32em">must</text>
          <circle className="legend-should" r={4.5} cx={70} />
          <text x={82} dy="0.32em">should</text>
          <circle className="legend-nice" r={4.5} cx={148} />
          <text x={160} dy="0.32em">nice</text>
        </g>
        <g transform="translate(8,38)">
          <circle className="legend-neutral" r={4.5} />
          <text x={12} dy="0.32em">branded size</text>
          <rect className="legend-neutral" x={115} y={-5} width={10} height={10} rx={2} />
          <text x={132} dy="0.32em">assortment slot</text>
        </g>
        <g transform="translate(10,64)">
          <circle className="status-ring status-matched" r={7} />
          <circle className="legend-neutral" r={4} />
          <text x={14} dy="0.32em">matched</text>
          <circle className="status-ring status-partial" r={7} cx={90} />
          <circle className="legend-neutral" r={4} cx={90} />
          <text x={104} dy="0.32em">partial</text>
          <circle className="legend-neutral" r={4} cx={170} />
          <text x={180} dy="0.32em">no ring: gap</text>
        </g>
        <g transform="translate(8,88)">
          <text dy="0.32em">↗ link to the canonical node</text>
        </g>
      </svg>
    </div>
  );
}
