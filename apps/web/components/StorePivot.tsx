"use client";

import { Fragment, useMemo, useState } from "react";
import { hasMoney, storePivot, type PivotItem, type PivotNode, type StoreFile, type StoreOut } from "../lib/stores";
import { money, pct } from "./format";

interface Props {
  file: StoreFile;
  store: StoreOut;
  medians: Map<string, number>[];
  onJumpItem: (id: string) => void;
}

const STATE_LABEL: Record<PivotItem["state"], string> = { bought: "carried", fading: "fading", gap: "gap", hold: "supply hold" };

/** A store's coverage as a pivot: department → category → item, each level against its peers. */
export function StorePivot({ file, store: s, medians, onJumpItem }: Props) {
  const money$ = hasMoney(file);
  const pivot = useMemo(() => storePivot(file, s, medians), [file, s, medians]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const nodeRow = (n: PivotNode, depth: number) => {
    const share = n.items ? n.bought / n.items : 0;
    const diff = Math.round((share - n.peers) * 100);
    const expanded = open.has(n.key);
    return (
      <tr key={n.key} className={`pivot-node depth-${depth}`}>
        <th scope="row">
          <button type="button" className="pivot-toggle" aria-expanded={expanded} onClick={() => toggle(n.key)}>
            <span className="caret" aria-hidden="true">
              {expanded ? "▾" : "▸"}
            </span>
            {n.label}
          </button>
        </th>
        <td className="num">
          {n.bought} <span className="muted">of {n.items}</span>
        </td>
        <td className="num">
          <span className="share">
            <span className="share-track with-tick" aria-hidden="true">
              <span className="share-fill" style={{ width: `${Math.max(share * 100, 1)}%` }} />
              <span className="tick" style={{ left: `${n.peers * 100}%` }} />
            </span>
            {pct(share)}
          </span>
        </td>
        <td className={`num ${diff < 0 ? "negative-soft" : ""}`}>
          {pct(n.peers)} <span className="muted">({diff > 0 ? "+" : ""}
          {diff})</span>
        </td>
        <td className="num">{n.mustGaps}</td>
        <td className="num">{n.fading}</td>
        {money$ && <td className="num">{n.expected ? money(n.expected) : "–"}</td>}
      </tr>
    );
  };

  const itemRow = (l: PivotItem) => (
    <tr key={l.index} className={`pivot-item item-${l.state}`}>
      <th scope="row">
        <button type="button" className="linklike quiet" onClick={() => onJumpItem(l.item.id)} title="View in the catalog chart">
          {l.item.item.split(" › ").slice(1).join(" › ") || l.item.item}
        </button>
        <span className="muted item-cat">
          <span className={`p-${l.item.priority}`}>{l.item.priority}</span> · {l.item.title} · <span className="mono">{l.item.sku}</span>
        </span>
      </th>
      <td>
        <span className={`state state-${l.state}`}>
          {STATE_LABEL[l.state]}
          {l.state === "fading" ? ` · ${l.days} days` : ""}
        </span>
      </td>
      <td className="num muted">peers buy {pct(l.adoption)}</td>
      <td colSpan={3} className="num muted">
        {money$ && l.item.price !== undefined ? (
          <>
            ${l.item.price.toFixed(2)}
            {l.item.promo ? " promo" : ""}
            {l.item.margin !== undefined ? ` · margin ${pct(l.item.margin, 1)}` : ""}
          </>
        ) : (
          ""
        )}
      </td>
      {money$ && <td className="num">{l.expected ? money(l.expected) : ""}</td>}
    </tr>
  );

  return (
    <div className="table-wrap pivot-wrap">
      <table className="sku-table pivot">
        <thead>
          <tr>
            <th>Department › category › item</th>
            <th className="num" title={`Catalog items carried: bought from Mercaso in the last ${file.window_days} days`}>
              Carried
            </th>
            <th className="num" title="Share of the items bought; the tick is the median of stores that order as often">
              Coverage
            </th>
            <th className="num" title="Median coverage of stores that order as often, and the difference in points">
              Peers
            </th>
            <th className="num" title={`Must items not bought in the last ${file.window_days} days (supply holds not counted)`}>
              Must gaps
            </th>
            <th className="num" title={`Bought in 12 months but not in the last ${file.window_days} days`}>
              Fading
            </th>
            {money$ && (
              <th className="num" title="Expected revenue a year from must and should gaps, if bought like peers">
                Opportunity
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {pivot.map((d) => (
            <Fragment key={d.key}>
              {nodeRow(d, 0)}
              {open.has(d.key) &&
                d.children.map((c) => (
                  <Fragment key={c.key}>
                    {nodeRow(c, 1)}
                    {open.has(c.key) && c.leaves.map(itemRow)}
                  </Fragment>
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="muted small pivot-help">Click a department for its categories, and a category for its items. Item columns: status, how many peers buy it{money$ ? ", price, margin and expected revenue a year" : ""}.</p>
    </div>
  );
}
