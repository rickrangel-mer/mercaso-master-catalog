// Store scoring for one "carried" window, shared by `pnpm stores` (CSV output) and the site (the
// Stores tab re-scores in the browser when the window changes). Pure: no Node or DOM.
//
// An item counts as carried by a store if the store bought it from Mercaso in the last N days
// (the window). Coverage, peer adoption, gaps and opportunity all follow from that; fading means
// bought in 12 months but not in the window.

export type Priority = "must" | "should" | "nice";
export type Trend = "up" | "down" | "flat" | "new" | "none";

export const DEFAULT_WINDOW_DAYS = 90;

/** A catalog item with a Mercaso SKU, as written by `pnpm stores`. */
export interface BaseItem {
  id: string;
  item: string;
  department: string;
  category: string;
  priority: Priority;
  type: "Branded" | "Slot";
  /** Recommended SKU: the item's approved SKU bought by the most liquor stores. */
  sku: string;
  title: string;
  case_pack: string;
  price?: number;
  promo?: boolean;
  margin?: number;
  /** Median cases a year per tier, among the tier's stores that bought the item in 12 months. */
  typical_cases: number[];
  /** Set while the item is on supply hold: counted as carried when bought, never as a gap. */
  hold?: { reason: string; since: string };
}

export interface BaseStore {
  id: string;
  number: string;
  name: string;
  organization: string;
  city: string;
  zip: string;
  status: "Active" | "Inactive";
  days_since_order: number;
  first_order: string;
  last_order: string;
  tier: number;
  orders_12m: number;
  orders_90d: number;
  orders_prev_90d: number;
  trend: Trend;
  spend_12m: number;
  /** Every item bought in 12 months: [item index, days since last bought], by item index. */
  last_bought: [number, number][];
}

export interface BaseFile {
  schema_version: 2;
  store_type: string;
  as_of: string;
  active_days: number;
  default_window_days: number;
  tiers: string[];
  departments: string[];
  totals: { must: number; should: number; nice: number };
  items: BaseItem[];
  stores: BaseStore[];
}

export interface ItemOut extends Omit<BaseItem, "typical_cases"> {
  /** Per tier: share of the tier's stores that carry it (bought in the window), and typical volume. */
  tiers: { adoption: number; typical_cases: number }[];
  /** Share of all stores that carry it. */
  adoption: number;
  /** Active stores that don't carry it, and the summed expected revenue there. */
  active_voids: number;
  opportunity: number;
}

export interface StoreOut extends BaseStore {
  /** Items carried (bought in the window), per priority. */
  must: number;
  should: number;
  nice: number;
  /** 0–100: must, should and nice coverage weighted 3:2:1. */
  score: number;
  /** Must coverage minus the tier's median must coverage, in points. */
  vs_peers: number;
  /** Coverage per department, in `departments` order (0–1). */
  departments: number[];
  /** Items not carried, per priority; supply holds are not counted. */
  voids: { must: number; should: number; nice: number };
  /** Bought in 12 months but not in the window (supply holds not counted). */
  fading: number;
  /** The three must gaps most carried by the store's tier (item indexes). */
  top_voids: number[];
  /** Expected revenue a year from must and should gaps: Σ tier adoption × typical cases × price,
   *  each recommended SKU counted once. */
  opportunity: number;
  /** Item indexes carried (bought in the window). */
  bought: number[];
  /** Bought in 12 months but not in the window: [item index, days since last bought]. */
  fading_items: [number, number][];
}

export interface StoreFile extends Omit<BaseFile, "items" | "stores"> {
  window_days: number;
  /** Tier medians of must coverage (0–1). */
  tier_median_must: number[];
  items: ItemOut[];
  stores: StoreOut[];
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

/** Scores every store for a window of `days` (1–365). */
export function scoreWindow(base: BaseFile, days: number): StoreFile {
  const window = Math.max(1, Math.min(365, Math.round(days)));
  const { items: baseItems, totals, departments } = base;
  const deptOf = baseItems.map((it) => departments.indexOf(it.department));
  const deptTotals = departments.map((_, d) => deptOf.filter((x) => x === d).length);
  const held = baseItems.map((it) => it.hold !== undefined);

  // Carried per store (bought in the window) and fading (older, within 12 months).
  const carried = base.stores.map((s) => s.last_bought.filter(([, d]) => d <= window).map(([i]) => i));
  const fadingOf = base.stores.map((s) => s.last_bought.filter(([, d]) => d > window));

  // Peer adoption per tier within the window.
  const tierSizes = base.tiers.map((_, t) => base.stores.filter((s) => s.tier === t).length);
  const counts = baseItems.map(() => base.tiers.map(() => 0));
  base.stores.forEach((s, k) => {
    for (const i of carried[k]!) counts[i]![s.tier]!++;
  });
  const items: ItemOut[] = baseItems.map(({ typical_cases, ...it }, i) => {
    const all = counts[i]!.reduce((a, b) => a + b, 0);
    return {
      ...it,
      tiers: base.tiers.map((_, t) => ({
        adoption: tierSizes[t] ? round(counts[i]![t]! / tierSizes[t]!) : 0,
        typical_cases: typical_cases[t] ?? 0,
      })),
      adoption: base.stores.length ? round(all / base.stores.length) : 0,
      active_voids: 0,
      opportunity: 0,
    };
  });
  const expected = (i: number, tier: number) => {
    const it = items[i]!;
    const t = it.tiers[tier]!;
    return it.price === undefined ? 0 : t.adoption * t.typical_cases * it.price;
  };

  const stores: StoreOut[] = base.stores.map((s, k) => {
    const bought = [...carried[k]!].sort((a, b) => a - b);
    const recent = new Set(bought);
    const count = { must: 0, should: 0, nice: 0 };
    const deptCount = departments.map(() => 0);
    for (const i of bought) {
      count[baseItems[i]!.priority]++;
      deptCount[deptOf[i]!]!++;
    }
    const voids = { must: 0, should: 0, nice: 0 };
    const mustVoids: number[] = [];
    const counted = new Set<string>();
    let opportunity = 0;
    items.forEach((it, i) => {
      if (recent.has(i) || held[i]) return;
      voids[it.priority]++;
      if (it.priority === "must") mustVoids.push(i);
      // Two items can share one SKU (a cigarette pack and carton); count its revenue once.
      if (it.priority !== "nice" && !counted.has(it.sku)) {
        counted.add(it.sku);
        opportunity += expected(i, s.tier);
      }
    });
    mustVoids.sort((a, b) => items[b]!.tiers[s.tier]!.adoption - items[a]!.tiers[s.tier]!.adoption);
    const cov = (p: Priority) => (totals[p] ? count[p] / totals[p] : 0);
    const fadingItems = fadingOf[k]!;
    return {
      ...s,
      ...count,
      score: round(((3 * cov("must") + 2 * cov("should") + cov("nice")) / 6) * 100, 1),
      vs_peers: 0,
      departments: deptCount.map((b, d) => (deptTotals[d] ? round(b / deptTotals[d]!, 3) : 0)),
      voids,
      fading: fadingItems.filter(([i]) => !held[i]).length,
      top_voids: mustVoids.slice(0, 3),
      opportunity: Math.round(opportunity),
      bought,
      fading_items: fadingItems,
    };
  });

  const mustShare = (s: StoreOut) => (totals.must ? s.must / totals.must : 0);
  const tierMedian = base.tiers.map((_, t) => median(stores.filter((s) => s.tier === t).map(mustShare)));
  for (const s of stores) s.vs_peers = round((mustShare(s) - tierMedian[s.tier]!) * 100, 1);

  // Item view for pricing: gaps at active stores and the expected revenue there.
  for (const s of stores) {
    if (s.status !== "Active") continue;
    const recent = new Set(s.bought);
    items.forEach((it, i) => {
      if (recent.has(i)) return;
      it.active_voids++;
      if (!held[i]) it.opportunity += expected(i, s.tier);
    });
  }
  for (const it of items) it.opportunity = Math.round(it.opportunity);

  const { items: _i, stores: _s, ...meta } = base;
  return { ...meta, window_days: window, tier_median_must: tierMedian.map((m) => round(m)), items, stores };
}
