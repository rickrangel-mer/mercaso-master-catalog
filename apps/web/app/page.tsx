"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DetailPanel } from "../components/DetailPanel";
import { Toolbar } from "../components/Toolbar";
import { OrgChart } from "../components/OrgChart";
import {
  ancestorIds,
  expandForHits,
  filterTree,
  indexCatalog,
  isLeaf,
  NO_FILTERS,
  ROOT_ID,
  visibleTree,
  type Filters,
  type StoreTypeCatalog,
  type ViewNode,
} from "../lib/tree";

interface StoreTypeEntry {
  store_type: string;
  name: string;
  file: string;
}

export default function Page() {
  const [storeTypes, setStoreTypes] = useState<StoreTypeEntry[]>([]);
  const [storeType, setStoreType] = useState<string>("");
  const [catalog, setCatalog] = useState<StoreTypeCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([ROOT_ID]));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; seq: number }>({ id: ROOT_ID, seq: 0 });
  const [anchor, setAnchor] = useState<{ id: string; seq: number }>({ id: ROOT_ID, seq: 0 });

  // Set by a jump so the search-cleared effect below does not collapse the path it just opened.
  const jumping = useRef(false);
  const focusOn = useCallback((id: string) => setFocus((f) => ({ id, seq: f.seq + 1 })), []);

  useEffect(() => {
    fetch("data/index.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`index.json: HTTP ${r.status}`))))
      .then((list: StoreTypeEntry[]) => {
        setStoreTypes(list);
        if (list[0]) setStoreType(list[0].store_type);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    const entry = storeTypes.find((s) => s.store_type === storeType);
    if (!entry) return;
    setCatalog(null);
    fetch(`data/${entry.file}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${entry.file}: HTTP ${r.status}`))))
      .then((c: StoreTypeCatalog) => {
        setCatalog(c);
        setFilters(NO_FILTERS);
        setExpanded(new Set([ROOT_ID]));
        setSelectedId(null);
        focusOn(ROOT_ID);
      })
      .catch((e: Error) => setError(e.message));
  }, [storeType, storeTypes, focusOn]);

  const index = useMemo(() => (catalog ? indexCatalog(catalog) : null), [catalog]);
  const filtered = useMemo(() => (index ? filterTree(index, filters) : null), [index, filters]);

  // A new search opens the path to every hit; clearing it goes back to departments only.
  // Runs only when the query or catalog changes, not on the other filters.
  useEffect(() => {
    if (!filtered) return;
    if (jumping.current) {
      jumping.current = false;
      return;
    }
    if (filters.query.trim()) {
      setExpanded(new Set([ROOT_ID, ...expandForHits(filtered.tree, filtered.hits)]));
      focusOn(filtered.hits.values().next().value ?? ROOT_ID);
    } else {
      setExpanded(new Set([ROOT_ID]));
      focusOn(ROOT_ID);
    }
  }, [filters.query, index]);

  const visible = useMemo(() => (filtered ? visibleTree(filtered.tree, expanded) : null), [filtered, expanded]);

  // Open or close a branch; the chart keeps that card where it is on screen.
  const toggle = useCallback((node: ViewNode) => {
    if (isLeaf(node) || node.children.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
    setAnchor((a) => ({ id: node.id, seq: a.seq + 1 }));
  }, []);

  const select = useCallback((node: ViewNode) => setSelectedId(node.id), []);

  const jumpTo = useCallback(
    (id: string) => {
      if (!index || !index.byId.has(id)) return;
      if (filters.query.trim()) jumping.current = true;
      setFilters(NO_FILTERS);
      setExpanded((prev) => new Set([...prev, ...ancestorIds(index, id)]));
      setSelectedId(id);
      focusOn(id);
    },
    [index, focusOn, filters.query],
  );

  const expandAll = useCallback(() => {
    if (!filtered) return;
    const all = new Set<string>();
    const rec = (n: ViewNode) => {
      if (n.children.length > 0 && !isLeaf(n)) all.add(n.id);
      n.children.forEach(rec);
    };
    rec(filtered.tree);
    setExpanded(all);
  }, [filtered]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set([ROOT_ID]));
    focusOn(ROOT_ID);
  }, [focusOn]);

  const selected = selectedId && index ? (index.byId.get(selectedId) ?? null) : null;

  return (
    <div className="app">
      <Toolbar
        storeTypes={storeTypes}
        storeType={storeType}
        onStoreType={setStoreType}
        catalog={catalog}
        filters={filters}
        onFilters={setFilters}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
      />
      <main className="main">
        <section className="tree-pane" aria-label="Catalog tree">
          {error && <p className="message">Could not load the catalog: {error}</p>}
          {!error && !visible && <p className="message">Loading…</p>}
          {visible && filtered && filtered.tree.children.length === 0 && (
            <p className="message">Nothing matches these filters.</p>
          )}
          {visible && index && (
            <OrgChart
              tree={visible}
              index={index}
              selectedId={selectedId}
              hits={filtered?.hits ?? new Set()}
              focus={focus}
              anchor={anchor}
              onSelect={select}
              onToggle={toggle}
            />
          )}
        </section>
        <DetailPanel node={selected} index={index} onJump={jumpTo} />
      </main>
    </div>
  );
}
