// Pure tree logic for the viewer: indexing, filtering and expansion. No React, no DOM.
import type { OutputNode, StoreTypeCatalog } from "../../../scripts/lib/output.ts";
import type { Priority } from "../../../scripts/lib/types.ts";

export type { OutputNode, Priority, StoreTypeCatalog };

export const PRIORITY_LEVELS: Priority[] = ["must", "should", "nice"];
export const ROOT_ID = "__store__";

/** A catalog node as the viewer sees it, under one synthetic store-type root. */
export interface ViewNode {
  id: string;
  name: string;
  kind: OutputNode["kind"] | "store_type";
  /** The built catalog node; undefined only for the root. */
  data?: OutputNode;
  children: ViewNode[];
}

/** Carried leaves under a node, by priority and coverage. */
export interface Rollup {
  leaves: number;
  must: number;
  should: number;
  nice: number;
  gap: number;
}

export interface CatalogIndex {
  catalog: StoreTypeCatalog;
  root: ViewNode;
  byId: Map<string, ViewNode>;
  parentOf: Map<string, string | null>;
  rollup: Map<string, Rollup>;
  /** Nodes with `verify` set on themselves or an ancestor. */
  flagged: Set<string>;
}

export interface Filters {
  query: string;
  priorities: Priority[];
  flaggedOnly: boolean;
  gapsOnly: boolean;
}

export const NO_FILTERS: Filters = { query: "", priorities: [...PRIORITY_LEVELS], flaggedOnly: false, gapsOnly: false };

export const isLeaf = (n: ViewNode) => n.kind === "size" || n.kind === "assortment_slot";
export const isLink = (n: ViewNode) => n.data?.attrs.cross_ref !== undefined && n.children.length === 0;

export function indexCatalog(catalog: StoreTypeCatalog): CatalogIndex {
  const byId = new Map<string, ViewNode>();
  const parentOf = new Map<string, string | null>();
  const rollup = new Map<string, Rollup>();
  const flagged = new Set<string>();

  const toView = (n: OutputNode, parentId: string, parentFlagged: boolean): ViewNode => {
    const isFlagged = parentFlagged || n.attrs.verify !== undefined;
    if (isFlagged) flagged.add(n.id);
    const view: ViewNode = { id: n.id, name: n.name, kind: n.kind, data: n, children: [] };
    byId.set(n.id, view);
    parentOf.set(n.id, parentId);
    view.children = (n.children ?? []).map((c) => toView(c, n.id, isFlagged));
    return view;
  };

  const root: ViewNode = { id: ROOT_ID, name: catalog.name, kind: "store_type", children: [] };
  byId.set(ROOT_ID, root);
  parentOf.set(ROOT_ID, null);
  root.children = catalog.departments.map((d) => toView(d, ROOT_ID, false));

  const roll = (n: ViewNode): Rollup => {
    const r: Rollup = { leaves: 0, must: 0, should: 0, nice: 0, gap: 0 };
    if (isLeaf(n)) {
      r.leaves = 1;
      if (n.data?.priority) r[n.data.priority] = 1;
      if (n.data?.match && n.data.match.status !== "matched" && n.data.match.status !== "covered") r.gap = 1;
    }
    for (const c of n.children) {
      const cr = roll(c);
      r.leaves += cr.leaves;
      r.must += cr.must;
      r.should += cr.should;
      r.nice += cr.nice;
      r.gap += cr.gap;
    }
    rollup.set(n.id, r);
    return r;
  };
  roll(root);

  return { catalog, root, byId, parentOf, rollup, flagged };
}

export function filtersActive(f: Filters): boolean {
  return f.query.trim() !== "" || f.priorities.length !== PRIORITY_LEVELS.length || f.flaggedOnly || f.gapsOnly;
}

/** Text a query term is matched against. Full ids are matched only by terms that contain a dot,
 * so "coca-cola" hits the Coca-Cola brand line and not every node below it. */
function searchText(n: ViewNode, term: string): string {
  const a = n.data?.attrs;
  const parts = [n.name, n.data?.key ?? "", ...(a?.brand_hints ?? []), n.data?.note ?? "", n.data?.store_note ?? ""];
  if (term.includes(".")) parts.push(n.id);
  return parts.join(" ").toLowerCase();
}

/**
 * Keep the nodes that pass the filters, plus their ancestors. A text hit on a non-leaf node
 * keeps its whole subtree (subject to the leaf filters). `hits` are the nodes the query matched.
 */
export function filterTree(index: CatalogIndex, filters: Filters): { tree: ViewNode; hits: Set<string> } {
  const terms = filters.query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = new Set<string>();
  const priorities = new Set(filters.priorities);
  const leafFiltersOn = priorities.size !== PRIORITY_LEVELS.length || filters.flaggedOnly || filters.gapsOnly;

  const rec = (n: ViewNode, ancestorHit: boolean): ViewNode | null => {
    const hit = terms.length > 0 && terms.every((t) => searchText(n, t).includes(t));
    if (hit) hits.add(n.id);
    const covered = terms.length === 0 || ancestorHit || hit;

    if (isLeaf(n)) {
      const d = n.data;
      const pass =
        covered &&
        (d?.priority === undefined || priorities.has(d.priority)) &&
        (!filters.flaggedOnly || index.flagged.has(n.id)) &&
        (!filters.gapsOnly || (d?.match !== undefined && d.match.status !== "matched" && d.match.status !== "covered"));
      return pass ? { ...n, children: [] } : null;
    }
    if (isLink(n)) return covered && !leafFiltersOn ? { ...n, children: [] } : null;

    const kids = n.children.map((c) => rec(c, ancestorHit || hit)).filter((c): c is ViewNode => c !== null);
    return kids.length > 0 ? { ...n, children: kids } : null;
  };

  const kids = index.root.children.map((c) => rec(c, false)).filter((c): c is ViewNode => c !== null);
  return { tree: { ...index.root, children: kids }, hits };
}

/** Ids to expand so every hit is visible: each node that has a hit strictly below it. */
export function expandForHits(tree: ViewNode, hits: Set<string>): Set<string> {
  const out = new Set<string>();
  const rec = (n: ViewNode): boolean => {
    let below = false;
    for (const c of n.children) if (rec(c)) below = true;
    if (below) out.add(n.id);
    return below || hits.has(n.id);
  };
  rec(tree);
  return out;
}

/** Ids from the root down to (not including) the node. */
export function ancestorIds(index: CatalogIndex, id: string): string[] {
  const out: string[] = [];
  let cur = index.parentOf.get(id) ?? null;
  while (cur !== null) {
    out.unshift(cur);
    cur = index.parentOf.get(cur) ?? null;
  }
  return out;
}

/** A node with its visible children; `hidden` counts children collapsed away. */
export interface VisibleNode {
  view: ViewNode;
  children: VisibleNode[];
  hidden: number;
}

export function visibleTree(tree: ViewNode, expanded: Set<string>): VisibleNode {
  const rec = (n: ViewNode): VisibleNode => {
    const open = n.id === ROOT_ID || expanded.has(n.id);
    return { view: n, children: open ? n.children.map(rec) : [], hidden: open ? 0 : n.children.length };
  };
  return rec(tree);
}

export const KIND_LABEL: Record<ViewNode["kind"], string> = {
  store_type: "Store type",
  department: "Department",
  category: "Category",
  subcategory: "Subcategory",
  brand_line: "Brand line",
  variant: "Variant",
  size: "Size (branded leaf)",
  assortment_slot: "Assortment slot",
};
