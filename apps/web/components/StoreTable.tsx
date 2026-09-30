"use client";

import { Fragment, useMemo, useState } from "react";
import {
  filterStores,
  groupStores,
  hasMoney,
  mustPct,
  pctOf,
  sortStores,
  storesToCsv,
  tierLabel,
  type StoreFile,
  type StoreFilters,
  type StoreGroupBy,
  type StoreOut,
  type StoreSortKey,
} from "../lib/stores";
import { downloadCsv, fmt, money, pct } from "./format";
import { StorePivot } from "./StorePivot";

interface Props {
  file: StoreFile;
  medians: Map<string, number>[];
  onOpen: (id: string) => void;
  onJumpItem: (id: string) => void;
}

const GROUPS: { id: StoreGroupBy; label: string }[] = [
  { id: "tier", label: "Order frequency" },
  { id: "band", label: "Must coverage" },
  { id: "status", label: "Status" },
  { id: "city", label: "City" },
  { id: "organization", label: "Organization" },
  { id: "none", label: "No grouping" },
];

const TREND: Record<StoreOut["trend"], { mark: string; label: string }> = {
  up: { mark: "↑", label: "up" },
  down: { mark: "↓", label: "down" },
  flat: { mark: "→", label: "flat" },
  new: { mark: "＋", label: "new" },
  none: { mark: "–", label: "no orders" },
};

const PAGE = 150;

export function StoreTable({ file, medians, onOpen, onJumpItem }: Props) {
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());
  const toggleStore = (id: string) =>
    setExpandedStores((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const money$ = hasMoney(file);
  const [filters, setFilters] = useState<StoreFilters>({ query: "", status: "all", tiers: file.tiers.map((_, i) => i), trend: "all" });
  const [groupBy, setGroupBy] = useState<StoreGroupBy>("tier");
  const [sort, setSort] = useState<{ key: StoreSortKey; dir: "asc" | "desc" }>({ key: money$ ? "opportunity" : "must_gaps", dir: "desc" });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<Record<string, number>>({});

  const filtered = useMemo(() => filterStores(file, filters), [file, filters]);
  const groups = useMemo(
    () => groupStores(file, filtered, groupBy).map((g) => ({ ...g, stores: sortStores(file, g.stores, sort.key, sort.dir) })),
    [file, filtered, groupBy, sort],
  );
  const searching = filters.query.trim() !== "";
  const isOpen = (key: string) => groupBy === "none" || searching || open.has(key);

  const allColumns: { id: StoreSortKey | null; label: string; className?: string; title?: string; money?: boolean }[] = [
    { id: "name", label: "Store" },
    { id: "days", label: "Status", title: `Active: ordered in the last ${file.active_days} days` },
    { id: "orders", label: "Orders 12 mo", className: "num", title: "Orders in 12 months, and the trend: last 90 days against the 90 days before" },
    { id: "spend", label: "Spend 12 mo", className: "num", money: true },
    { id: "score", label: "Score", className: "num", title: "Catalog score 0–100: must, should and nice coverage weighted 3:2:1" },
    { id: "must", label: "Must", className: "num", title: `Share of the ${file.totals.must} must items carried: bought from Mercaso in the last ${file.window_days} days` },
    { id: null, label: "Should", className: "num" },
    { id: null, label: "Nice", className: "num" },
    { id: "vs_peers", label: "vs. peers", className: "num", title: "Must coverage minus the median of stores that order as often, in points" },
    { id: "must_gaps", label: "Must gaps", className: "num", title: `Must items not bought in the last ${file.window_days} days (supply holds not counted)` },
    { id: "fading", label: "Fading", className: "num", title: `Items bought in 12 months but not in the last ${file.window_days} days` },
    { id: "opportunity", label: "Opportunity", className: "num", money: true, title: "Expected revenue a year from must and should gaps: peer adoption × typical peer volume × today's price" },
  ];
  const columns = allColumns.filter((c) => money$ || !c.money);

  const sortBy = (key: StoreSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "days" ? "asc" : "desc" }));
  const toggleTier = (t: number) =>
    setFilters((f) => ({ ...f, tiers: f.tiers.includes(t) ? f.tiers.filter((x) => x !== t) : [...f.tiers, t].sort() }));
  const toggleGroup = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="store-table">
      <div className="controls" role="group" aria-label="Store filters">
        <label className="field search">
          <span className="visually-hidden">Search stores</span>
          <input type="search" placeholder="Search store, number, city, ZIP" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} />
        </label>
        <label className="field inline">
          <span>Status</span>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as StoreFilters["status"] })}>
            <option value="all">All</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </label>
        <div className="chips" role="group" aria-label="Order frequency">
          {file.tiers.map((t, i) => (
            <button key={t} type="button" className="chip" aria-pressed={filters.tiers.includes(i)} onClick={() => toggleTier(i)}>
              {t}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={filters.trend === "down"} onChange={(e) => setFilters({ ...filters, trend: e.target.checked ? "down" : "all" })} />
          Ordering less
        </label>
        <label className="field inline">
          <span>Group by</span>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as StoreGroupBy)}>
            {GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <div className="buttons">
          {groupBy !== "none" && (
            <>
              <button type="button" onClick={() => setOpen(new Set(groups.map((g) => g.key)))}>
                Open all
              </button>
              <button type="button" onClick={() => setOpen(new Set())}>
                Close all
              </button>
            </>
          )}
          <button type="button" onClick={() => downloadCsv(`mercaso-liquor-stores-${file.as_of}.csv`, storesToCsv(file, sortStores(file, filtered, sort.key, sort.dir)))}>
            Download CSV
          </button>
        </div>
      </div>
      <p className="table-summary muted">
        <strong>{fmt(filtered.length)}</strong> stores · <strong>{fmt(filtered.filter((s) => s.status === "Active").length)}</strong> active. Click a row to break the store down by department, category and item; click its name for the store detail.
      </p>

      <div className="table-wrap">
        <table className="sku-table stores">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.label} className={c.className} title={c.title} aria-sort={c.id && sort.key === c.id ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {c.id ? (
                    <button type="button" className="sort" onClick={() => sortBy(c.id!)}>
                      {c.label}
                      <span className="sort-mark" aria-hidden="true">
                        {sort.key === c.id ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="muted empty">
                  No stores match these filters.
                </td>
              </tr>
            )}
            {groups.map((g) => {
              const expanded = isOpen(g.key);
              const limit = shown[g.key] ?? PAGE;
              return (
                <Fragment key={g.key}>
                  {groupBy !== "none" && (
                    <tr className="group-row">
                      <th colSpan={columns.length} scope="rowgroup">
                        <button type="button" className="group-toggle" aria-expanded={expanded} onClick={() => toggleGroup(g.key)}>
                          <span className="caret" aria-hidden="true">
                            {expanded ? "▾" : "▸"}
                          </span>
                          <span className="group-label">{g.label}</span>
                          <span className="group-stats">
                            <span>{fmt(g.stats.stores)} stores</span>
                            <span>{fmt(g.stats.active)} active</span>
                            <span>median must {pct(g.stats.medianMust)}</span>
                            {money$ && <span>opportunity {money(g.stats.opportunity)}</span>}
                          </span>
                        </button>
                      </th>
                    </tr>
                  )}
                  {expanded &&
                    g.stores.slice(0, limit).map((s) => (
                      <Fragment key={s.id}>
                      <tr className={`clickable ${expandedStores.has(s.id) ? "is-expanded" : ""}`} onClick={() => toggleStore(s.id)} aria-expanded={expandedStores.has(s.id)}>
                        <td className="product">
                          <span className="store-name">
                            <span className="caret" aria-hidden="true">
                              {expandedStores.has(s.id) ? "▾" : "▸"}
                            </span>
                            <button type="button" className="linklike" onClick={(e) => (e.stopPropagation(), onOpen(s.id))} title="Open the store's detail and gap list">
                              {s.name || s.number}
                            </button>
                          </span>
                          <span className="mono muted">
                            {s.number} · {s.city} {s.zip}
                          </span>
                          {s.organization && <span className="muted item-cat">{s.organization}</span>}
                        </td>
                        <td>
                          <span className={`status-pill ${s.status === "Active" ? "is-active" : "is-inactive"}`}>{s.status}</span>
                          <span className="muted item-cat">{s.days_since_order === 0 ? "ordered today" : s.days_since_order === 1 ? "1 day ago" : `${s.days_since_order} days ago`}</span>
                        </td>
                        <td className="num">
                          {fmt(s.orders_12m)}{" "}
                          <span className={`trend trend-${s.trend}`} title={`Trend: ${TREND[s.trend].label} (${s.orders_90d} vs ${s.orders_prev_90d})`}>
                            {TREND[s.trend].mark}
                          </span>
                          <span className="muted item-cat">{tierLabel(file, s.tier)}</span>
                        </td>
                        {money$ && <td className="num">{money(s.spend_12m)}</td>}
                        <td className="num">{s.score.toFixed(0)}</td>
                        <td className="num">
                          <span className="share">
                            <span className="share-track" aria-hidden="true">
                              <span className="share-fill" style={{ width: `${Math.max(mustPct(file, s) * 100, 1)}%` }} />
                            </span>
                            {pct(mustPct(file, s))}
                          </span>
                        </td>
                        <td className="num">{pct(pctOf(s.should, file.totals.should))}</td>
                        <td className="num">{pct(pctOf(s.nice, file.totals.nice))}</td>
                        <td className={`num ${s.vs_peers < 0 ? "negative-soft" : ""}`}>
                          {s.vs_peers > 0 ? "+" : ""}
                          {s.vs_peers.toFixed(0)} pts
                        </td>
                        <td className="num">{fmt(s.voids.must)}</td>
                        <td className="num">{fmt(s.fading)}</td>
                        {money$ && <td className="num">{money(s.opportunity)}</td>}
                      </tr>
                      {expandedStores.has(s.id) && (
                        <tr className="pivot-row">
                          <td colSpan={columns.length}>
                            <StorePivot file={file} store={s} medians={medians} onJumpItem={onJumpItem} />
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    ))}
                  {expanded && g.stores.length > limit && (
                    <tr>
                      <td colSpan={columns.length} className="more-row">
                        <button type="button" className="linklike" onClick={() => setShown((m) => ({ ...m, [g.key]: limit + PAGE }))}>
                          Show {fmt(Math.min(PAGE, g.stores.length - limit))} more of {fmt(g.stores.length - limit)}
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
