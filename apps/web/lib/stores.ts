// Pure logic for the Stores tab: filtering, grouping and sorting stores, a store's gaps, the stores
// missing an item, the pivot, and CSV export. The input is a StoreFile scored for the viewer's
// carried window by `scoreWindow` (./score.ts) from dist/stores/<store-type>.json.
import { median, type ItemOut, type StoreFile, type StoreOut } from "./score";

export type { ItemOut, StoreFile, StoreOut };
export { median };

export const pctOf = (n: number, d: number) => (d ? n / d : 0);
export const mustPct = (f: StoreFile, s: StoreOut) => pctOf(s.must, f.totals.must);

export const BANDS = ["Under 10%", "10–25%", "25–50%", "50–75%", "75% and up"] as const;
export function bandOf(share: number): number {
  return share < 0.1 ? 0 : share < 0.25 ? 1 : share < 0.5 ? 2 : share < 0.75 ? 3 : 4;
}

export const TIER_LABELS: Record<string, string> = { "1-5": "1–5 orders", "6-20": "6–20 orders", "21-50": "21–50 orders", "51+": "51+ orders" };
export const tierLabel = (f: StoreFile, t: number) => TIER_LABELS[f.tiers[t] ?? ""] ?? f.tiers[t] ?? "";

/** Prices, margins, spend and opportunity are present only in a build made with pricing. */
export const hasMoney = (f: StoreFile) => f.items.some((i) => i.price !== undefined);

// ---- Store table -------------------------------------------------------------------------

export interface StoreFilters {
  query: string;
  status: "all" | "Active" | "Inactive";
  tiers: number[];
  trend: "all" | "down";
}

export function filterStores(f: StoreFile, x: StoreFilters): StoreOut[] {
  const terms = x.query.toLowerCase().split(/\s+/).filter(Boolean);
  const tiers = new Set(x.tiers);
  return f.stores.filter((s) => {
    if (x.status !== "all" && s.status !== x.status) return false;
    if (!tiers.has(s.tier)) return false;
    if (x.trend === "down" && s.trend !== "down") return false;
    if (terms.length === 0) return true;
    const text = [s.name, s.number, s.organization, s.city, s.zip].join(" ").toLowerCase();
    return terms.every((t) => text.includes(t));
  });
}

export type StoreSortKey = "name" | "days" | "orders" | "spend" | "score" | "must" | "vs_peers" | "must_gaps" | "fading" | "opportunity";

export function sortStores(f: StoreFile, list: StoreOut[], key: StoreSortKey, dir: "asc" | "desc"): StoreOut[] {
  const sign = dir === "asc" ? 1 : -1;
  const val = (s: StoreOut): number | string => {
    switch (key) {
      case "name":
        return s.name.toLowerCase();
      case "days":
        return s.days_since_order;
      case "orders":
        return s.orders_12m;
      case "spend":
        return s.spend_12m;
      case "score":
        return s.score;
      case "must":
        return mustPct(f, s);
      case "vs_peers":
        return s.vs_peers;
      case "must_gaps":
        return s.voids.must;
      case "fading":
        return s.fading;
      case "opportunity":
        return s.opportunity;
    }
  };
  return [...list].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x < y) return -sign;
    if (x > y) return sign;
    return a.name.localeCompare(b.name);
  });
}

export type StoreGroupBy = "tier" | "status" | "band" | "city" | "organization" | "none";

export interface StoreGroup {
  key: string;
  label: string;
  stores: StoreOut[];
  stats: { stores: number; active: number; medianMust: number; opportunity: number };
}

/** Groups in a natural order: tiers and bands ascending, status Active first, others by size. */
export function groupStores(f: StoreFile, list: StoreOut[], by: StoreGroupBy): StoreGroup[] {
  const statsOf = (stores: StoreOut[]) => ({
    stores: stores.length,
    active: stores.filter((s) => s.status === "Active").length,
    medianMust: median(stores.map((s) => mustPct(f, s))),
    opportunity: stores.reduce((a, s) => a + s.opportunity, 0),
  });
  if (by === "none") return [{ key: "all", label: "All stores", stores: list, stats: statsOf(list) }];
  const keyOf = (s: StoreOut): [string, string, number] => {
    switch (by) {
      case "tier":
        return [String(s.tier), tierLabel(f, s.tier), s.tier];
      case "status":
        return [s.status, s.status, s.status === "Active" ? 0 : 1];
      case "band": {
        const b = bandOf(mustPct(f, s));
        return [String(b), `Must coverage ${BANDS[b]}`, b];
      }
      case "city":
        return [s.city || "(no city)", s.city || "(no city)", 0];
      case "organization":
        return [s.organization || "(independent)", s.organization || "(independent)", 0];
    }
  };
  const groups = new Map<string, StoreGroup & { order: number }>();
  for (const s of list) {
    const [key, label, order] = keyOf(s);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, label, order, stores: [], stats: statsOf([]) }));
    g.stores.push(s);
  }
  const out = [...groups.values()];
  for (const g of out) g.stats = statsOf(g.stores);
  const natural = by === "tier" || by === "status" || by === "band";
  out.sort((a, b) => (natural ? a.order - b.order : b.stores.length - a.stores.length || a.label.localeCompare(b.label)));
  return out;
}

// ---- A store's gaps ----------------------------------------------------------------------

export interface Gap {
  index: number;
  item: ItemOut;
  /** Share of the store's tier that buys the item. */
  adoption: number;
  typicalCases: number;
  /** Days since the store last bought it, when it is fading; undefined when not bought in 12 months. */
  fadingDays?: number;
  /** Expected revenue a year: adoption × typical cases × price (0 on supply hold or without prices). */
  expected: number;
  hold: boolean;
}

/** Items the store has not bought in 90 days, best first: not on hold, then peer adoption. */
export function storeGaps(f: StoreFile, s: StoreOut): Gap[] {
  const recent = new Set(s.bought);
  const fading = new Map(s.fading_items);
  const out: Gap[] = [];
  f.items.forEach((item, index) => {
    if (recent.has(index)) return;
    const t = item.tiers[s.tier] ?? { adoption: 0, typical_cases: 0 };
    const hold = item.hold !== undefined;
    const days = fading.get(index);
    out.push({
      index,
      item,
      adoption: t.adoption,
      typicalCases: t.typical_cases,
      ...(days !== undefined ? { fadingDays: days } : {}),
      expected: hold || item.price === undefined ? 0 : t.adoption * t.typical_cases * item.price,
      hold,
    });
  });
  return out.sort((a, b) => Number(a.hold) - Number(b.hold) || b.adoption - a.adoption || b.expected - a.expected);
}

/** Coverage per department for a store's tier: the median across the tier's stores. */
export function tierDepartmentMedians(f: StoreFile): number[][] {
  return f.tiers.map((_, t) => {
    const stores = f.stores.filter((s) => s.tier === t);
    return f.departments.map((_, d) => median(stores.map((s) => s.departments[d] ?? 0)));
  });
}

// ---- Items view (pricing and push) -------------------------------------------------------

/** Active stores that have not bought the item in 90 days, most frequent buyers first. */
export function storesMissing(f: StoreFile, index: number): StoreOut[] {
  return f.stores
    .filter((s) => s.status === "Active" && !s.bought.includes(index))
    .sort((a, b) => (f.items[index]!.tiers[b.tier]?.adoption ?? 0) - (f.items[index]!.tiers[a.tier]?.adoption ?? 0) || b.orders_12m - a.orders_12m);
}

// ---- Summary -----------------------------------------------------------------------------

export function storeSummary(f: StoreFile) {
  const active = f.stores.filter((s) => s.status === "Active");
  const inactive = f.stores.filter((s) => s.status === "Inactive");
  const bands = BANDS.map(() => ({ active: 0, inactive: 0 }));
  for (const s of f.stores) bands[bandOf(mustPct(f, s))]![s.status === "Active" ? "active" : "inactive"]++;
  return {
    stores: f.stores.length,
    active: active.length,
    inactive: inactive.length,
    inactiveMedianDays: median(inactive.map((s) => s.days_since_order)),
    medianMustActive: median(active.map((s) => mustPct(f, s))),
    under10: f.stores.filter((s) => mustPct(f, s) < 0.1).length,
    decliningActive: active.filter((s) => s.trend === "down").length,
    bands,
    tierMedians: f.tier_median_must,
    tierCounts: f.tiers.map((_, t) => f.stores.filter((s) => s.tier === t).length),
  };
}

// ---- CSV ---------------------------------------------------------------------------------

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
const csv = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
const p1 = (x: number) => (x * 100).toFixed(1);

export function storesToCsv(f: StoreFile, list: StoreOut[]): string {
  const money = hasMoney(f);
  const head = ["carried_window_days", "store", "store_number", "organization", "city", "zip", "status", "days_since_order", "order_tier", "orders_12m", "orders_90d", "trend", ...(money ? ["spend_12m"] : []), "catalog_score", "must_pct", "should_pct", "nice_pct", "must_vs_peers_pts", "must_gaps", "should_gaps", "fading_items", "top_must_gaps", ...(money ? ["est_opportunity_yr"] : [])];
  return csv([
    head,
    ...list.map((s) => [
      String(f.window_days), s.name, s.number, s.organization, s.city, s.zip, s.status, String(s.days_since_order), f.tiers[s.tier] ?? "", String(s.orders_12m), String(s.orders_90d), s.trend,
      ...(money ? [s.spend_12m.toFixed(2)] : []),
      s.score.toFixed(1), p1(pctOf(s.must, f.totals.must)), p1(pctOf(s.should, f.totals.should)), p1(pctOf(s.nice, f.totals.nice)), s.vs_peers.toFixed(1),
      String(s.voids.must), String(s.voids.should), String(s.fading), s.top_voids.map((i) => f.items[i]?.item ?? "").join(" | "),
      ...(money ? [String(s.opportunity)] : []),
    ]),
  ]);
}

export function gapsToCsv(f: StoreFile, s: StoreOut, gaps: Gap[]): string {
  const money = hasMoney(f);
  const head = ["store", "department", "catalog_item", "priority", "gap_type", "days_since_bought", "recommended_sku", "product", "case_pack", "peer_adoption_pct", "typical_peer_cases_yr", ...(money ? ["price_no_crv", "promo", "margin_pct", "est_revenue_yr"] : []), "supply_hold"];
  return csv([
    head,
    ...gaps.map((g) => [
      s.name, g.item.department, g.item.item, g.item.priority, g.fadingDays === undefined ? "not bought 12 mo" : "fading", g.fadingDays === undefined ? "" : String(g.fadingDays),
      g.item.sku, g.item.title, g.item.case_pack, p1(g.adoption), String(g.typicalCases),
      ...(money ? [g.item.price?.toFixed(2) ?? "", g.item.promo ? "yes" : "no", g.item.margin === undefined ? "" : p1(g.item.margin), String(Math.round(g.expected))] : []),
      g.hold ? g.item.hold!.reason : "",
    ]),
  ]);
}

export function missingToCsv(f: StoreFile, index: number, stores: StoreOut[]): string {
  const it = f.items[index]!;
  return csv([
    ["catalog_item", "recommended_sku", "store", "store_number", "city", "zip", "order_tier", "orders_12m", "peer_adoption_pct", "gap_type"],
    ...stores.map((s) => {
      const fading = s.fading_items.find(([i]) => i === index);
      return [it.item, it.sku, s.name, s.number, s.city, s.zip, f.tiers[s.tier] ?? "", String(s.orders_12m), p1(it.tiers[s.tier]?.adoption ?? 0), fading ? "fading" : "not bought 12 mo"];
    }),
  ]);
}

// ---- Pivot: a store's coverage by department, category and item --------------------------

export type ItemState = "bought" | "fading" | "gap" | "hold";

export interface PivotItem {
  index: number;
  item: ItemOut;
  state: ItemState;
  /** Days since last bought, for fading items. */
  days?: number;
  /** Share of the store's tier that buys it. */
  adoption: number;
  /** Expected revenue a year for a must or should gap (0 otherwise). */
  expected: number;
}

export interface PivotNode {
  key: string;
  label: string;
  /** Catalog items under the node, and those the store carries (bought within the window). */
  items: number;
  bought: number;
  /** Median coverage of the node among stores in the same tier (0–1). */
  peers: number;
  mustGaps: number;
  gaps: number;
  fading: number;
  expected: number;
  children: PivotNode[];
  /** Items, on category nodes. */
  leaves: PivotItem[];
}

/** Items the store carries: bought within the window. */
export const carried = (s: StoreOut) => new Set(s.bought);

const catKey = (it: ItemOut) => `${it.department}|${it.category}`;

/**
 * Peer medians for every department and category, per tier: the median across the tier's stores
 * of the share of the node's items each store carries. Computed once per scored file.
 */
export function peerMedians(f: StoreFile): Map<string, number>[] {
  const nodes = new Map<string, number[]>();
  f.items.forEach((it, i) => {
    for (const k of [it.department, catKey(it)]) nodes.set(k, [...(nodes.get(k) ?? []), i]);
  });
  return f.tiers.map((_, t) => {
    const stores = f.stores.filter((s) => s.tier === t).map(carried);
    const out = new Map<string, number>();
    for (const [k, idx] of nodes) out.set(k, median(stores.map((b) => idx.filter((i) => b.has(i)).length / idx.length)));
    return out;
  });
}

/** The store's pivot: departments (catalog order) → categories → items. */
export function storePivot(f: StoreFile, s: StoreOut, medians: Map<string, number>[]): PivotNode[] {
  const recent = new Set(s.bought);
  const fading = new Map(s.fading_items);
  const peers = medians[s.tier] ?? new Map<string, number>();
  const leaf = (item: ItemOut, index: number): PivotItem => {
    const t = item.tiers[s.tier] ?? { adoption: 0, typical_cases: 0 };
    const hold = item.hold !== undefined;
    const days = fading.get(index);
    const state: ItemState = recent.has(index) ? "bought" : hold ? "hold" : days !== undefined ? "fading" : "gap";
    const isGap = state === "gap" || state === "fading";
    return {
      index,
      item,
      state,
      ...(days !== undefined ? { days } : {}),
      adoption: t.adoption,
      expected: isGap && item.priority !== "nice" && item.price !== undefined ? t.adoption * t.typical_cases * item.price : 0,
    };
  };
  const total = (key: string, label: string, leaves: PivotItem[], children: PivotNode[]): PivotNode => {
    // A SKU shared by two items (cigarette pack and carton) counts once in the expected revenue.
    const skus = new Set<string>();
    let expected = 0;
    for (const l of leaves) {
      if (l.expected > 0 && !skus.has(l.item.sku)) {
        skus.add(l.item.sku);
        expected += l.expected;
      }
    }
    return {
      key,
      label,
      items: leaves.length,
      bought: leaves.filter((l) => l.state === "bought").length,
      peers: peers.get(key) ?? 0,
      mustGaps: leaves.filter((l) => (l.state === "gap" || l.state === "fading") && l.item.priority === "must").length,
      gaps: leaves.filter((l) => l.state === "gap" || l.state === "fading").length,
      fading: leaves.filter((l) => l.state === "fading").length,
      expected,
      children,
      leaves: children.length ? [] : leaves,
    };
  };
  const rank: Record<ItemState, number> = { gap: 0, fading: 1, hold: 2, bought: 3 };
  return f.departments.map((dept) => {
    const deptLeaves: PivotItem[] = [];
    const cats = new Map<string, PivotItem[]>();
    f.items.forEach((it, i) => {
      if (it.department !== dept) return;
      const l = leaf(it, i);
      deptLeaves.push(l);
      cats.set(it.category, [...(cats.get(it.category) ?? []), l]);
    });
    const children = [...cats.entries()].map(([cat, leaves]) =>
      total(`${dept}|${cat}`, cat, [...leaves].sort((a, b) => rank[a.state] - rank[b.state] || b.adoption - a.adoption), []),
    );
    return total(dept, dept, deptLeaves, children);
  });
}
