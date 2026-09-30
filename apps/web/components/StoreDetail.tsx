"use client";

import { useMemo, useState } from "react";
import { gapsToCsv, hasMoney, mustPct, pctOf, storeGaps, tierDepartmentMedians, tierLabel, type StoreFile, type StoreOut } from "../lib/stores";
import { PRIORITY_LEVELS, type Priority } from "../lib/tree";
import { downloadCsv, fmt, money, pct } from "./format";

interface Props {
  file: StoreFile;
  store: StoreOut;
  onClose: () => void;
  onJumpItem: (id: string) => void;
}

const SHOW = 25;

export function StoreDetail({ file, store: s, onClose, onJumpItem }: Props) {
  const money$ = hasMoney(file);
  const [priorities, setPriorities] = useState<Priority[]>(["must", "should"]);
  const [kind, setKind] = useState<"all" | "fading">("all");
  const [limit, setLimit] = useState(SHOW);
  const gaps = useMemo(() => storeGaps(file, s), [file, s]);
  const deptMedians = useMemo(() => tierDepartmentMedians(file)[s.tier] ?? [], [file, s.tier]);
  const inPriority = gaps.filter((g) => priorities.includes(g.item.priority));
  const shown = inPriority.filter((g) => kind === "all" || g.fadingDays !== undefined);
  const peerMust = file.tier_median_must[s.tier] ?? 0;

  const togglePriority = (p: Priority) =>
    setPriorities((cur) => PRIORITY_LEVELS.filter((x) => (x === p ? !cur.includes(p) : cur.includes(x))));

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`Store ${s.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <h2 className="detail-title">{s.name || s.number}</h2>
            <p className="muted">
              {s.number} · {s.city} {s.zip}
              {s.organization ? ` · ${s.organization}` : ""}
            </p>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="store-facts">
          <div>
            <span className={`status-pill ${s.status === "Active" ? "is-active" : "is-inactive"}`}>{s.status}</span>
            <span className="muted"> last order {s.last_order} ({s.days_since_order} days)</span>
          </div>
          <div className="muted">
            {tierLabel(file, s.tier)} · {s.orders_90d} orders in the last 90 days vs {s.orders_prev_90d} before · customer since {s.first_order}
            {money$ ? ` · ${money(s.spend_12m)} in 12 months` : ""}
          </div>
        </div>

        <div className="tiles compact">
          <div className="tile">
            <div className="tile-label">Must items bought</div>
            <div className="tile-value">
              {s.must} <span className="of">of {file.totals.must}</span>
            </div>
            <div className="tile-sub muted">
              {pct(mustPct(file, s))} · peers {pct(peerMust)} ({s.vs_peers > 0 ? "+" : ""}
              {s.vs_peers.toFixed(0)} pts)
            </div>
          </div>
          <div className="tile">
            <div className="tile-label">Should · nice</div>
            <div className="tile-value">
              {pct(pctOf(s.should, file.totals.should))} <span className="of">· {pct(pctOf(s.nice, file.totals.nice))}</span>
            </div>
            <div className="tile-sub muted">catalog score {s.score.toFixed(0)}</div>
          </div>
          {money$ && (
            <div className="tile">
              <div className="tile-label">Opportunity a year</div>
              <div className="tile-value">{money(s.opportunity)}</div>
              <div className="tile-sub muted">if it bought its must and should gaps like its peers</div>
            </div>
          )}
        </div>

        <section>
          <h3 className="section-title">Coverage by department</h3>
          <p className="muted small">Bar: this store. Tick: the median of stores that order as often.</p>
          <div className="bars">
            {file.departments.map((d, i) => (
              <div key={d} className="bar-row">
                <span className="bar-label" title={d}>
                  {d}
                </span>
                <span className="bar-track with-tick" role="img" aria-label={`${d}: ${pct(s.departments[i] ?? 0)}, peers ${pct(deptMedians[i] ?? 0)}`}>
                  <span className="bar-fill" style={{ width: `${Math.max((s.departments[i] ?? 0) * 100, 1)}%` }} />
                  <span className="tick" style={{ left: `${(deptMedians[i] ?? 0) * 100}%` }} />
                </span>
                <span className="bar-value">
                  <strong>{pct(s.departments[i] ?? 0)}</strong> <span className="muted">peers {pct(deptMedians[i] ?? 0)}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="section-bar">
            <h3 className="section-title">Gaps to push</h3>
            <button type="button" className="small-button" onClick={() => downloadCsv(`mercaso-gaps-${s.number || s.id}.csv`, gapsToCsv(file, s, gaps))}>
              Download all gaps
            </button>
          </div>
          <p className="muted small">Items this store hasn&apos;t bought from us in 90 days, most bought by its peers first.</p>
          <div className="controls">
            <div className="chips" role="group" aria-label="Priority">
              {PRIORITY_LEVELS.map((p) => (
                <button key={p} type="button" className={`chip chip-${p}`} aria-pressed={priorities.includes(p)} onClick={() => togglePriority(p)}>
                  {p}
                </button>
              ))}
            </div>
            <label className="field inline">
              <span>Show</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as "all" | "fading")}>
                <option value="all">All gaps ({fmt(inPriority.length)})</option>
                <option value="fading">Fading only ({fmt(inPriority.filter((g) => g.fadingDays !== undefined).length)})</option>
              </select>
            </label>
          </div>
          <div className="table-wrap">
            <table className="sku-table gaps">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Gap</th>
                  <th className="num" title="Share of stores that order as often and bought it in 12 months">
                    Peers buy
                  </th>
                  <th>Recommended SKU</th>
                  {money$ && (
                    <>
                      <th className="num">Price</th>
                      <th className="num">Margin</th>
                      <th className="num" title="Peer adoption × typical peer cases a year × price">
                        Est. / yr
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={money$ ? 7 : 4} className="muted empty">
                      No gaps with these filters.
                    </td>
                  </tr>
                )}
                {shown.slice(0, limit).map((g) => (
                  <tr key={g.index} className={g.hold ? "held-row" : undefined}>
                    <td className="item">
                      <button type="button" className="linklike quiet" onClick={() => onJumpItem(g.item.id)} title="View in the catalog chart">
                        {g.item.item}
                      </button>
                      <span className="muted item-cat">
                        <span className={`p-${g.item.priority}`}>{g.item.priority}</span> · {g.item.department}
                      </span>
                    </td>
                    <td>
                      {g.hold ? (
                        <span className="tag hold-tag" title={g.item.hold!.reason}>
                          supply hold
                        </span>
                      ) : g.fadingDays !== undefined ? (
                        <span className="fading">fading · {g.fadingDays} days</span>
                      ) : (
                        <span className="muted">not bought</span>
                      )}
                    </td>
                    <td className="num">{pct(g.adoption)}</td>
                    <td className="product">
                      <span className="product-title">{g.item.title}</span>
                      <span className="mono muted">{g.item.sku}</span>
                    </td>
                    {money$ && (
                      <>
                        <td className="num">
                          {g.item.price !== undefined ? `$${g.item.price.toFixed(2)}` : "–"}
                          {g.item.promo && <span className="promo">promo</span>}
                        </td>
                        <td className={`num ${g.item.margin !== undefined && g.item.margin < 0 ? "negative" : ""}`}>{g.item.margin !== undefined ? pct(g.item.margin, 1) : "–"}</td>
                        <td className="num">{g.hold ? "–" : money(g.expected)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length > limit && (
            <button type="button" className="linklike more" onClick={() => setLimit(limit + SHOW)}>
              Show {Math.min(SHOW, shown.length - limit)} more of {fmt(shown.length - limit)}
            </button>
          )}
        </section>
      </aside>
    </div>
  );
}
