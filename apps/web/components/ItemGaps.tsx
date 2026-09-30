"use client";

import { Fragment, useMemo, useState } from "react";
import { hasMoney, missingToCsv, storesMissing, tierLabel, type StoreFile } from "../lib/stores";
import { PRIORITY_LEVELS, type Priority } from "../lib/tree";
import { downloadCsv, fmt, money, pct } from "./format";

interface Props {
  file: StoreFile;
  onOpenStore: (id: string) => void;
  onJumpItem: (id: string) => void;
}

type SortKey = "opportunity" | "missing" | "adoption" | "margin";
const PAGE = 100;

/** Items view for pricing and pushes: which catalog items the most active stores are missing. */
export function ItemGaps({ file, onOpenStore, onJumpItem }: Props) {
  const money$ = hasMoney(file);
  const [query, setQuery] = useState("");
  const [priorities, setPriorities] = useState<Priority[]>(["must", "should"]);
  const [department, setDepartment] = useState("all");
  const [showHeld, setShowHeld] = useState(false);
  const [sort, setSort] = useState<SortKey>(money$ ? "opportunity" : "missing");
  const [openItem, setOpenItem] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const val = (i: number) => {
      const it = file.items[i]!;
      return sort === "opportunity" ? it.opportunity : sort === "missing" ? it.active_voids : sort === "adoption" ? it.adoption : (it.margin ?? -9);
    };
    return file.items
      .map((it, i) => i)
      .filter((i) => {
        const it = file.items[i]!;
        if (!priorities.includes(it.priority)) return false;
        if (department !== "all" && it.department !== department) return false;
        if (it.hold && !showHeld) return false;
        const text = [it.item, it.title, it.sku, it.department].join(" ").toLowerCase();
        return terms.every((t) => text.includes(t));
      })
      .sort((a, b) => val(b) - val(a));
  }, [file, query, priorities, department, showHeld, sort]);
  const held = file.items.filter((i) => i.hold).length;
  const colSpan = money$ ? 8 : 5;

  const togglePriority = (p: Priority) =>
    setPriorities((cur) => PRIORITY_LEVELS.filter((x) => (x === p ? !cur.includes(p) : cur.includes(x))));
  const sortHeader = (key: SortKey, label: string, title: string) => (
    <th className="num" title={title} aria-sort={sort === key ? "descending" : undefined}>
      <button type="button" className="sort" onClick={() => setSort(key)}>
        {label}
        <span className="sort-mark" aria-hidden="true">
          {sort === key ? "▼" : ""}
        </span>
      </button>
    </th>
  );

  return (
    <div className="item-gaps">
      <p className="muted">
        One row per catalog item: how many active stores haven&apos;t bought it from us in 90 days
        {money$ ? ", and the revenue if they bought it like their peers. This is the list for the pricing program and for pushes." : ". This is the list for pushes."} Click
        a row for the stores.
      </p>
      <div className="controls" role="group" aria-label="Item filters">
        <label className="field search">
          <span className="visually-hidden">Search items</span>
          <input type="search" placeholder="Search item, product, SKU" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="chips" role="group" aria-label="Priority">
          {PRIORITY_LEVELS.map((p) => (
            <button key={p} type="button" className={`chip chip-${p}`} aria-pressed={priorities.includes(p)} onClick={() => togglePriority(p)}>
              {p}
            </button>
          ))}
        </div>
        <label className="field inline">
          <span>Department</span>
          <select value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="all">All</option>
            {file.departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        {held > 0 && (
          <label className="check">
            <input type="checkbox" checked={showHeld} onChange={(e) => setShowHeld(e.target.checked)} />
            Show {held} on supply hold
          </label>
        )}
      </div>
      <p className="table-summary muted">
        <strong>{fmt(rows.length)}</strong> items
      </p>
      <div className="table-wrap">
        <table className="sku-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Recommended SKU</th>
              {money$ && (
                <>
                  <th className="num">Price</th>
                  {sortHeader("margin", "Margin", "(price − average cost without CRV) ÷ price")}
                </>
              )}
              {sortHeader("adoption", "Stores buying", "Share of all stores that bought it in 12 months")}
              {sortHeader("missing", "Active stores missing it", "Active stores that haven't bought it in 90 days")}
              {money$ && sortHeader("opportunity", "Opportunity / yr", "Sum over those stores of peer adoption × typical peer volume × price")}
              <th aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((i) => {
              const it = file.items[i]!;
              const open = openItem === i;
              const missing = open ? storesMissing(file, i) : [];
              return (
                <Fragment key={it.id}>
                  <tr className={`clickable ${it.hold ? "held-row" : ""}`} onClick={() => setOpenItem(open ? null : i)} aria-expanded={open}>
                    <td className="item">
                      <button type="button" className="linklike quiet" onClick={(e) => (e.stopPropagation(), onJumpItem(it.id))} title="View in the catalog chart">
                        {it.item}
                      </button>
                      <span className="muted item-cat">
                        <span className={`p-${it.priority}`}>{it.priority}</span> · {it.department}
                        {it.hold && (
                          <>
                            {" "}
                            · <span className="tag hold-tag">supply hold</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="product">
                      <span className="product-title">{it.title}</span>
                      <span className="mono muted">
                        {it.sku} · case of {it.case_pack}
                      </span>
                    </td>
                    {money$ && (
                      <>
                        <td className="num">
                          {it.price !== undefined ? `$${it.price.toFixed(2)}` : "–"}
                          {it.promo && <span className="promo">promo</span>}
                        </td>
                        <td className={`num ${it.margin !== undefined && it.margin < 0 ? "negative" : ""}`}>{it.margin !== undefined ? pct(it.margin, 1) : "–"}</td>
                      </>
                    )}
                    <td className="num">{pct(it.adoption)}</td>
                    <td className="num">{fmt(it.active_voids)}</td>
                    {money$ && <td className="num">{it.hold ? "–" : money(it.opportunity)}</td>}
                    <td className="caret-cell" aria-hidden="true">
                      {open ? "▾" : "▸"}
                    </td>
                  </tr>
                  {open && (
                    <tr className="expand-row">
                      <td colSpan={colSpan}>
                        <div className="section-bar">
                          <strong>{fmt(missing.length)} active stores missing it</strong>
                          <button type="button" className="small-button" onClick={() => downloadCsv(`mercaso-missing-${it.sku}.csv`, missingToCsv(file, i, missing))}>
                            Download list
                          </button>
                        </div>
                        <ul className="missing-list">
                          {missing.slice(0, 12).map((s) => {
                            const fading = s.fading_items.find(([x]) => x === i);
                            return (
                              <li key={s.id}>
                                <button type="button" className="linklike" onClick={() => onOpenStore(s.id)}>
                                  {s.name || s.number}
                                </button>{" "}
                                <span className="muted">
                                  {s.city} · {tierLabel(file, s.tier)} · peers {pct(it.tiers[s.tier]?.adoption ?? 0)}
                                  {fading ? ` · fading ${fading[1]} days` : ""}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                        {missing.length > 12 && <p className="muted small">Download the list for all {fmt(missing.length)}.</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" className="linklike more" onClick={() => setLimit(limit + PAGE)}>
          Show {Math.min(PAGE, rows.length - limit)} more of {fmt(rows.length - limit)}
        </button>
      )}
    </div>
  );
}
