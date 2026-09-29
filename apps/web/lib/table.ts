// Pure logic for the SKU table and the overview: one row per matched Mercaso SKU, grouping with
// subtotals, and CSV export. No React, no DOM.
import { isLeaf, PRIORITY_LEVELS, ROOT_ID, type CatalogIndex, type Priority, type ViewNode } from "./tree";

export type SkuStatus = "approved" | "proposed";

/** One (catalog item, Mercaso SKU) pair; `sku` is undefined for an item with no Mercaso SKU. */
export interface SkuRow {
  key: string;
  leafId: string;
  department: string;
  /** Department position, for its tint (1-based). */
  departmentIndex: number;
  category: string;
  /** The item below the category: "Coca-Cola › Classic › 20oz bottle" or a slot name. */
  item: string;
  type: "Branded" | "Slot";
  priority: Priority;
  sku?: string;
  title?: string;
  status?: SkuStatus;
  casePack?: number;
  /** Share of CA liquor stores that bought the SKU (0–1). */
  share12?: number;
  share90?: number;
  /** Today's case price without CRV (the promo price when on promo). Present only when the site has prices. */
  price?: number;
  promo?: boolean;
  /** Average case cost and (price - cost) / price. */
  cost?: number;
  margin?: number;
}

/** public/data/prices.json, written by the web build from a gitignored export. */
export interface PriceFile {
  as_of: string;
  prices: Record<string, { price: number; promo: boolean; cost?: number; margin?: number }>;
}

/** Adds today's price, cost and margin to each SKU row. */
export function withPrices(rows: SkuRow[], file: PriceFile | null): SkuRow[] {
  if (!file) return rows;
  return rows.map((r) => {
    const p = r.sku ? file.prices[r.sku] : undefined;
    if (!p) return r;
    return {
      ...r,
      price: p.price,
      promo: p.promo,
      ...(p.cost !== undefined ? { cost: p.cost } : {}),
      ...(p.margin !== undefined ? { margin: p.margin } : {}),
    };
  });
}

/** Every carried leaf's SKUs, plus one row per leaf that has none. Rejected SKUs are left out. */
export function skuRows(index: CatalogIndex): SkuRow[] {
  const rows: SkuRow[] = [];
  const walk = (n: ViewNode, trail: ViewNode[]) => {
    if (isLeaf(n)) {
      const d = n.data;
      if (!d?.priority) return;
      const dept = trail[0];
      const cat = trail[1];
      const item = [...trail.slice(2), n].map((x) => x.name).join(" › ");
      const base = {
        leafId: n.id,
        department: dept?.name ?? "",
        departmentIndex: dept ? index.root.children.indexOf(dept) + 1 : 0,
        category: cat?.name ?? "",
        item,
        type: n.kind === "assortment_slot" ? ("Slot" as const) : ("Branded" as const),
        priority: d.priority,
      };
      const skus = d.match?.skus ?? [];
      if (skus.length === 0) rows.push({ ...base, key: `${n.id}|` });
      for (const s of skus) {
        rows.push({
          ...base,
          key: `${n.id}|${s.sku}|${s.case_pack ?? ""}`,
          sku: s.sku,
          ...(s.title ? { title: s.title } : {}),
          status: s.status === "approved" ? "approved" : "proposed",
          ...(s.case_pack !== undefined ? { casePack: s.case_pack } : {}),
          ...(s.share_12m !== undefined ? { share12: s.share_12m } : {}),
          ...(s.share_90d !== undefined ? { share90: s.share_90d } : {}),
        });
      }
      return;
    }
    for (const c of n.children) walk(c, n.id === ROOT_ID ? [] : [...trail, n]);
  };
  walk(index.root, []);
  return rows;
}

export type GroupBy = "department" | "category" | "priority" | "type" | "none";

export interface GroupStats {
  /** Rows that carry a SKU. */
  skus: number;
  /** Distinct catalog items. */
  items: number;
  /** Items with no SKU at all. */
  gaps: number;
  must: number;
  should: number;
  nice: number;
  /** Highest 12-month store share among the group's SKUs. */
  topShare: number;
  /** Mean margin of the group's SKUs that have one. */
  avgMargin?: number;
}

export interface Group {
  key: string;
  label: string;
  /** Department position for the tint, when grouping by department or category. */
  departmentIndex?: number;
  rows: SkuRow[];
  stats: GroupStats;
}

export function statsOf(rows: SkuRow[]): GroupStats {
  const items = new Map<string, Priority>();
  const withSku = new Set<string>();
  let skus = 0;
  let topShare = 0;
  let marginSum = 0;
  let margins = 0;
  for (const r of rows) {
    if (r.margin !== undefined) {
      marginSum += r.margin;
      margins++;
    }
    items.set(r.leafId, r.priority);
    if (r.sku) {
      skus++;
      withSku.add(r.leafId);
      topShare = Math.max(topShare, r.share12 ?? 0);
    }
  }
  const byPriority = { must: 0, should: 0, nice: 0 };
  for (const p of items.values()) byPriority[p]++;
  return {
    skus,
    items: items.size,
    gaps: items.size - withSku.size,
    ...byPriority,
    topShare,
    ...(margins > 0 ? { avgMargin: marginSum / margins } : {}),
  };
}

/** Groups in catalog order (priority order when grouping by priority), each with its subtotals. */
export function groupRows(rows: SkuRow[], by: GroupBy): Group[] {
  if (by === "none") return [{ key: "all", label: "All SKUs", rows, stats: statsOf(rows) }];
  const keyOf = (r: SkuRow): [string, string] => {
    switch (by) {
      case "department":
        return [r.department, r.department];
      case "category":
        return [`${r.department}|${r.category}`, `${r.department} › ${r.category}`];
      case "priority":
        return [r.priority, r.priority];
      case "type":
        return [r.type, r.type === "Branded" ? "Branded items" : "Assortment slots"];
    }
  };
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const [key, label] = keyOf(r);
    let g = groups.get(key);
    if (!g) {
      g = { key, label, rows: [], stats: statsOf([]) };
      if (by === "department" || by === "category") g.departmentIndex = r.departmentIndex;
      groups.set(key, g);
    }
    g.rows.push(r);
  }
  const list = [...groups.values()];
  for (const g of list) g.stats = statsOf(g.rows);
  if (by === "priority") list.sort((a, b) => PRIORITY_LEVELS.indexOf(a.key as Priority) - PRIORITY_LEVELS.indexOf(b.key as Priority));
  return list;
}

export type SortKey = "share12" | "share90" | "priority" | "title" | "item" | "price" | "margin";

/** Sort rows in place-free fashion: by the key, then by 12-month share, then by title. */
export function sortRows(rows: SkuRow[], key: SortKey, dir: "asc" | "desc"): SkuRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const val = (r: SkuRow): number | string => {
    switch (key) {
      case "share12":
        return r.share12 ?? -1;
      case "share90":
        return r.share90 ?? -1;
      case "priority":
        return PRIORITY_LEVELS.indexOf(r.priority);
      case "title":
        return (r.title ?? "").toLowerCase();
      case "item":
        return `${r.category} ${r.item}`.toLowerCase();
      case "price":
        return r.price ?? -1;
      case "margin":
        return r.margin ?? -99;
    }
  };
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x < y) return -sign;
    if (x > y) return sign;
    return (b.share12 ?? -1) - (a.share12 ?? -1) || (a.title ?? "").localeCompare(b.title ?? "");
  });
}

export interface RowFilters {
  query: string;
  priorities: Priority[];
  status: "all" | SkuStatus;
  includeGaps: boolean;
}

export function filterRows(rows: SkuRow[], f: RowFilters): SkuRow[] {
  const terms = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  const priorities = new Set(f.priorities);
  return rows.filter((r) => {
    if (!priorities.has(r.priority)) return false;
    if (!r.sku && !f.includeGaps) return false;
    if (r.sku && f.status !== "all" && r.status !== f.status) return false;
    if (terms.length === 0) return true;
    const text = [r.title, r.sku, r.department, r.category, r.item].join(" ").toLowerCase();
    return terms.every((t) => text.includes(t));
  });
}

const pct = (x: number | undefined) => (x === undefined ? "" : (x * 100).toFixed(1));

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function rowsToCsv(rows: SkuRow[]): string {
  const header = [
    "department",
    "category",
    "catalog_item",
    "type",
    "priority",
    "mercaso_sku",
    "product",
    "case_pack",
    "store_share_12m_pct",
    "store_share_90d_pct",
    "status",
    "catalog_id",
    "price_no_crv",
    "price_type",
    "average_cost",
    "margin_pct",
  ];
  const lines = rows.map((r) =>
    [
      r.department,
      r.category,
      r.item,
      r.type,
      r.priority,
      r.sku ?? "",
      r.title ?? "(no Mercaso SKU)",
      r.casePack?.toString() ?? "",
      pct(r.share12),
      pct(r.share90),
      r.status ?? "gap",
      r.leafId,
      r.price?.toFixed(2) ?? "",
      r.price === undefined ? "" : r.promo ? "promo" : "regular",
      r.cost?.toFixed(2) ?? "",
      pct(r.margin),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}

/** Coverage per department for the overview: items, and items with an approved SKU. */
export interface Coverage {
  label: string;
  departmentIndex: number;
  items: number;
  covered: number;
  byPriority: Record<Priority, { items: number; covered: number }>;
}

const isCovered = (n: ViewNode) => n.data?.match?.status === "matched" || n.data?.match?.status === "covered";

export function coverageByDepartment(index: CatalogIndex): Coverage[] {
  return index.root.children.map((dept, i) => {
    const c: Coverage = {
      label: dept.name,
      departmentIndex: i + 1,
      items: 0,
      covered: 0,
      byPriority: { must: { items: 0, covered: 0 }, should: { items: 0, covered: 0 }, nice: { items: 0, covered: 0 } },
    };
    const walk = (n: ViewNode) => {
      if (isLeaf(n)) {
        const p = n.data?.priority;
        if (!p) return;
        c.items++;
        c.byPriority[p].items++;
        if (isCovered(n)) {
          c.covered++;
          c.byPriority[p].covered++;
        }
        return;
      }
      n.children.forEach(walk);
    };
    walk(dept);
    return c;
  });
}

/** Must-carry items with no approved SKU, for the overview's short list. */
export function mustGaps(index: CatalogIndex): { id: string; path: string; pending: number }[] {
  const out: { id: string; path: string; pending: number }[] = [];
  const walk = (n: ViewNode, trail: string[]) => {
    if (isLeaf(n)) {
      if (n.data?.priority === "must" && !isCovered(n)) out.push({ id: n.id, path: [...trail, n.name].join(" › "), pending: n.data.match?.pending ?? 0 });
      return;
    }
    n.children.forEach((c) => walk(c, n.id === ROOT_ID ? [] : [...trail, n.name]));
  };
  walk(index.root, []);
  return out;
}

/** Distinct approved Mercaso SKUs across the catalog. */
export function approvedSkuCount(rows: SkuRow[]): number {
  return new Set(rows.filter((r) => r.status === "approved").map((r) => r.sku)).size;
}
