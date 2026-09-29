"use client";

export type Tab = "overview" | "chart" | "table";

export const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "chart", label: "Catalog chart" },
  { id: "table", label: "SKU table" },
];

interface Props {
  storeTypes: { store_type: string; name: string }[];
  storeType: string;
  onStoreType: (s: string) => void;
  tab: Tab;
  onTab: (t: Tab) => void;
  /** Data date of a single-file snapshot; undefined on the live site. */
  snapshot?: string | undefined;
}

export function Header({ storeTypes, storeType, onStoreType, tab, onTab, snapshot }: Props) {
  return (
    <header className="site-header">
      <div className="brand">
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
        {snapshot && <span className="snapshot muted">Snapshot {snapshot}</span>}
      </div>
      <nav className="tabs" role="tablist" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className="tab"
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
