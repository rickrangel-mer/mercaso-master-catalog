"use client";

import { PRIORITY_LEVELS, type Filters, type Priority, type StoreTypeCatalog } from "../lib/tree";

interface Props {
  storeTypes: { store_type: string; name: string }[];
  storeType: string;
  onStoreType: (s: string) => void;
  catalog: StoreTypeCatalog | null;
  filters: Filters;
  onFilters: (f: Filters) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function Toolbar({ storeTypes, storeType, onStoreType, catalog, filters, onFilters, onExpandAll, onCollapseAll }: Props) {
  const togglePriority = (p: Priority) => {
    const has = filters.priorities.includes(p);
    const next = has ? filters.priorities.filter((x) => x !== p) : [...filters.priorities, p];
    onFilters({ ...filters, priorities: PRIORITY_LEVELS.filter((x) => next.includes(x)) });
  };
  const s = catalog?.summary;

  return (
    <header className="toolbar">
      <div className="toolbar-row">
        <h1 className="title">Master Catalog</h1>
        <label className="field">
          <span className="visually-hidden">Store type</span>
          <select value={storeType} onChange={(e) => onStoreType(e.target.value)} disabled={storeTypes.length < 2}>
            {storeTypes.map((t) => (
              <option key={t.store_type} value={t.store_type}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field search">
          <span className="visually-hidden">Search</span>
          <input
            type="search"
            placeholder="Search names, ids, brands"
            value={filters.query}
            onChange={(e) => onFilters({ ...filters, query: e.target.value })}
          />
        </label>
        <div className="chips" role="group" aria-label="Priority">
          {PRIORITY_LEVELS.map((p) => (
            <button
              key={p}
              type="button"
              className={`chip chip-${p}`}
              aria-pressed={filters.priorities.includes(p)}
              onClick={() => togglePriority(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={filters.gapsOnly}
            onChange={(e) => onFilters({ ...filters, gapsOnly: e.target.checked })}
          />
          Gaps only
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={filters.flaggedOnly}
            onChange={(e) => onFilters({ ...filters, flaggedOnly: e.target.checked })}
          />
          Needs data check
        </label>
        <div className="buttons">
          <button type="button" onClick={onExpandAll}>
            Expand all
          </button>
          <button type="button" onClick={onCollapseAll}>
            Collapse
          </button>
        </div>
      </div>
      {s && (
        <p className="summary">
          <strong>{s.leaves}</strong> leaves · <span className="p-must">{s.by_priority.must} must</span> ·{" "}
          <span className="p-should">{s.by_priority.should} should</span> ·{" "}
          <span className="p-nice">{s.by_priority.nice} nice</span> · matched {s.match.matched + s.match.covered}, partial{" "}
          {s.match.partial}, gap {s.match.gap}
          {s.dropped_restricted.length > 0 && catalog?.state && (
            <> · {s.dropped_restricted.length} nodes not sold in {catalog.state}</>
          )}
        </p>
      )}
    </header>
  );
}
