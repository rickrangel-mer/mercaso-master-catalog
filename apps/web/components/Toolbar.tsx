"use client";

import { PRIORITY_LEVELS, type Filters, type Priority } from "../lib/tree";

interface Props {
  filters: Filters;
  onFilters: (f: Filters) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

/** Controls for the catalog chart: search, priority, gaps, open and close. */
export function Toolbar({ filters, onFilters, onExpandAll, onCollapseAll }: Props) {
  const togglePriority = (p: Priority) => {
    const has = filters.priorities.includes(p);
    const next = has ? filters.priorities.filter((x) => x !== p) : [...filters.priorities, p];
    onFilters({ ...filters, priorities: PRIORITY_LEVELS.filter((x) => next.includes(x)) });
  };

  return (
    <div className="controls chart-controls" role="group" aria-label="Chart controls">
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
          <button key={p} type="button" className={`chip chip-${p}`} aria-pressed={filters.priorities.includes(p)} onClick={() => togglePriority(p)}>
            {p}
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={filters.gapsOnly} onChange={(e) => onFilters({ ...filters, gapsOnly: e.target.checked })} />
        Only items without an approved SKU
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
  );
}
