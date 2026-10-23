"use client";

import { useEffect, useRef } from "react";

export type Tab = "overview" | "chart" | "table" | "stores" | "wallet" | "market";

export const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "chart", label: "Catalog chart" },
  { id: "table", label: "SKU table" },
  { id: "stores", label: "Stores" },
  { id: "wallet", label: "Wallet" },
  { id: "market", label: "Market" },
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
  // On a phone the tabs scroll inside their own row; keep the open one in view.
  const tabs = useRef<HTMLElement>(null);
  useEffect(() => {
    tabs.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);
  return (
    <header className="site-header">
      <div className="brand">
        <span className="product-name">
          <Mark />
          Mercaso Master Catalog
        </span>
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
        {snapshot && <span className="snapshot muted">Catalog prices as of {snapshot}</span>}
      </div>
      <nav className="tabs" role="tablist" aria-label="Sections" ref={tabs}>
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

/** The product's mark: a catalog drawn as its family tree, one root and three branches. */
function Mark() {
  return (
    <svg className="mark" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="7" y="1.5" width="6" height="5" rx="1.2" />
      <rect x="1" y="13.5" width="5" height="5" rx="1.2" />
      <rect x="7.5" y="13.5" width="5" height="5" rx="1.2" />
      <rect x="14" y="13.5" width="5" height="5" rx="1.2" />
      <path d="M10 6.5v7M3.5 13.5v-3h13v3" fill="none" />
    </svg>
  );
}
