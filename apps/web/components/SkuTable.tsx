"use client";

import { Fragment, useMemo, useState, type CSSProperties } from "react";
import {
  filterRows,
  groupRows,
  rowsToCsv,
  sortRows,
  statsOf,
  type GroupBy,
  type RowFilters,
  type SkuRow,
  type SortKey,
} from "../lib/table";
import { PRIORITY_LEVELS, type Priority } from "../lib/tree";

interface Props {
  rows: SkuRow[];
  /** Date of the price and cost snapshot; undefined when the site was built without prices. */
  pricesAsOf?: string | undefined;
  onJump: (id: string) => void;
}

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: "department", label: "Department" },
  { id: "category", label: "Category" },
  { id: "priority", label: "Priority" },
  { id: "type", label: "Branded vs slot" },
  { id: "none", label: "No grouping" },
];

const COLUMNS: { id: SortKey | null; label: string; className?: string; title?: string }[] = [
  { id: "title", label: "Mercaso product" },
  { id: "item", label: "Catalog item" },
  { id: "priority", label: "Priority" },
  { id: null, label: "Type", title: "Branded: a specific brand, flavor and size. Slot: an open shelf spot any fitting product can fill." },
  { id: "share12", label: "Penetration 12 mo", className: "num", title: "Share of California liquor stores that bought this SKU from Mercaso in the last 12 months" },
  { id: "share90", label: "90 days", className: "num", title: "Same share over the last 90 days" },
  { id: null, label: "Case", className: "num" },
  { id: "price", label: "Price", className: "num price-col", title: "Today's case price without CRV; the promo price when the item is on promo" },
  { id: "margin", label: "Margin", className: "num price-col", title: "(price − average cost without CRV) ÷ price" },
  { id: null, label: "Status", title: "Approved: reviewed and confirmed. Proposed: suggested by the matcher, awaiting review." },
];

const pct = (x: number | undefined) => (x === undefined ? "–" : `${(x * 100).toFixed(x >= 0.1 ? 0 : 1)}%`);
const margin = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmt = (n: number) => n.toLocaleString("en-US");

export function SkuTable({ rows, pricesAsOf, onJump }: Props) {
  const hasPrices = pricesAsOf !== undefined;
  const columns = hasPrices ? COLUMNS : COLUMNS.filter((c) => !c.className?.includes("price-col"));
  const [filters, setFilters] = useState<RowFilters>({ query: "", priorities: [...PRIORITY_LEVELS], status: "all", includeGaps: false });
  const [groupBy, setGroupBy] = useState<GroupBy>("department");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "share12", dir: "desc" });
  const [open, setOpen] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => filterRows(rows, filters), [rows, filters]);
  // Groups keep catalog order; the sort applies to the rows inside each group.
  const groups = useMemo(
    () => groupRows(filtered, groupBy).map((g) => ({ ...g, rows: sortRows(g.rows, sort.key, sort.dir) })),
    [filtered, sort, groupBy],
  );
  const total = useMemo(() => statsOf(filtered), [filtered]);
  const searching = filters.query.trim() !== "";
  const isOpen = (key: string) => groupBy === "none" || searching || open.has(key);

  const togglePriority = (p: Priority) => {
    const has = filters.priorities.includes(p);
    const next = has ? filters.priorities.filter((x) => x !== p) : [...filters.priorities, p];
    setFilters({ ...filters, priorities: PRIORITY_LEVELS.filter((x) => next.includes(x)) });
  };
  const toggleGroup = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const sortBy = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "share12" || key === "share90" ? "desc" : "asc" }));

  const download = () => {
    const blob = new Blob([rowsToCsv(sortRows(filtered, sort.key, sort.dir))], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mercaso-liquor-catalog-skus.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sku-table-view">
      <div className="block-head">
        <h2>Every Mercaso SKU in the catalog</h2>
        <p className="muted">
          One row per Mercaso SKU matched to a catalog item. Groups start closed: open one to see its SKUs, or search to open them all.
          Penetration is the share of California liquor stores that bought the SKU.
          {hasPrices && <> Price is today&apos;s case price without CRV (promo price when on promo); margin uses average cost without CRV, as of {pricesAsOf}.</>}
        </p>
      </div>

      <div className="controls" role="group" aria-label="Table controls">
        <label className="field search">
          <span className="visually-hidden">Search</span>
          <input
            type="search"
            placeholder="Search product, SKU, brand, category"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
          />
        </label>
        <div className="chips" role="group" aria-label="Priority">
          {PRIORITY_LEVELS.map((p) => (
            <button key={p} type="button" className={`chip chip-${p}`} aria-pressed={filters.priorities.includes(p)} onClick={() => togglePriority(p)}>
              {p}
            </button>
          ))}
        </div>
        <label className="field inline">
          <span>Status</span>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as RowFilters["status"] })}>
            <option value="all">All</option>
            <option value="approved">Approved</option>
            <option value="proposed">Proposed</option>
          </select>
        </label>
        <label className="field inline">
          <span>Group by</span>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            {GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.includeGaps} onChange={(e) => setFilters({ ...filters, includeGaps: e.target.checked })} />
          Show items with no SKU
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
          <button type="button" onClick={download}>
            Download CSV
          </button>
        </div>
      </div>

      <p className="table-summary muted">
        <strong>{fmt(total.skus)}</strong> SKUs across <strong>{fmt(total.items)}</strong> catalog items
        {total.gaps > 0 && <> · {fmt(total.gaps)} items with no SKU</>}
      </p>

      <div className="table-wrap">
        <table className="sku-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.label}
                  className={c.className}
                  title={c.title}
                  aria-sort={c.id && sort.key === c.id ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
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
                  Nothing matches these filters.
                </td>
              </tr>
            )}
            {groups.map((g) => {
              const shown = isOpen(g.key);
              return (
                <Fragment key={g.key}>
                  {groupBy !== "none" && (
                    <tr className="group-row">
                      <th colSpan={columns.length} scope="rowgroup">
                        <button type="button" className="group-toggle" aria-expanded={shown} onClick={() => toggleGroup(g.key)}>
                          <span className="caret" aria-hidden="true">
                            {shown ? "▾" : "▸"}
                          </span>
                          {g.departmentIndex !== undefined && (
                            <span className="swatch" style={{ "--tint": `var(--cat-${g.departmentIndex})` } as CSSProperties} aria-hidden="true" />
                          )}
                          <span className={`group-label ${groupBy === "priority" ? `p-${g.key}` : ""}`}>{g.label}</span>
                          <span className="group-stats">
                            <span>{fmt(g.stats.skus)} SKUs</span>
                            <span>{fmt(g.stats.items)} items</span>
                            {groupBy !== "priority" && (
                              <span>
                                <span className="p-must">{g.stats.must}</span> / <span className="p-should">{g.stats.should}</span> /{" "}
                                <span className="p-nice">{g.stats.nice}</span>
                                <span className="visually-hidden"> must / should / nice</span>
                              </span>
                            )}
                            {g.stats.gaps > 0 && <span>{g.stats.gaps} with no SKU</span>}
                            {g.stats.skus > 0 && <span>top {pct(g.stats.topShare)}</span>}
                            {g.stats.avgMargin !== undefined && <span>avg margin {margin(g.stats.avgMargin)}</span>}
                          </span>
                        </button>
                      </th>
                    </tr>
                  )}
                  {shown && g.rows.map((r) => <Row key={r.key} r={r} showCategory={groupBy !== "category"} hasPrices={hasPrices} onJump={onJump} />)}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {groupBy !== "none" && (
        <p className="muted small">
          Group subtotals show SKUs, catalog items, the items split as <span className="p-must">must</span> /{" "}
          <span className="p-should">should</span> / <span className="p-nice">nice</span>, the best-selling SKU&apos;s penetration{hasPrices && ", and the average margin"}.
        </p>
      )}
    </div>
  );
}

function Row({ r, showCategory, hasPrices, onJump }: { r: SkuRow; showCategory: boolean; hasPrices: boolean; onJump: (id: string) => void }) {
  return (
    <tr className={r.sku ? undefined : "gap-row"}>
      <td className="product">
        {r.sku ? (
          <>
            <span className="product-title">{r.title ?? r.sku}</span>
            <span className="mono muted">{r.sku}</span>
          </>
        ) : (
          <span className="muted">No Mercaso SKU</span>
        )}
      </td>
      <td className="item">
        <button type="button" className="linklike quiet" onClick={() => onJump(r.leafId)} title="View in the catalog chart">
          {r.item}
        </button>
        {showCategory && <span className="muted item-cat">{r.category}</span>}
      </td>
      <td>
        <span className={`tag prio prio-${r.priority}`}>{r.priority}</span>
      </td>
      <td className="muted">{r.type}</td>
      <td className="num">
        {r.share12 !== undefined ? (
          <span className="share">
            <span className="share-track" aria-hidden="true">
              <span className="share-fill" style={{ width: `${Math.max(r.share12 * 100, 1)}%` }} />
            </span>
            {pct(r.share12)}
          </span>
        ) : (
          "–"
        )}
      </td>
      <td className="num">{pct(r.share90)}</td>
      <td className="num">{r.casePack ?? "–"}</td>
      {hasPrices && (
        <>
          <td className="num">
            {r.price !== undefined ? `$${r.price.toFixed(2)}` : "–"}
            {r.promo && <span className="promo">promo</span>}
          </td>
          <td className={`num ${r.margin !== undefined && r.margin < 0 ? "negative" : ""}`}>{r.margin !== undefined ? margin(r.margin) : "–"}</td>
        </>
      )}
      <td>{r.status ? <span className={`status status-${r.status}`}>{r.status}</span> : <span className="muted">gap</span>}</td>
    </tr>
  );
}
