// Store view: how much of the master catalog each store buys from Mercaso. Pure logic for
// `pnpm stores`; see docs/exploration/store-penetration.md for the definitions.
import type { LeafInfo } from "../match/review-lib.ts";

export const ACTIVE_DAYS = 45;
export const PRIORITY_WEIGHT = { must: 3, should: 2, nice: 1 } as const;
type Priority = keyof typeof PRIORITY_WEIGHT;

/** Order-frequency tiers (orders in 12 months). Stores are compared with their own tier. */
export const TIERS = [
  { key: "1-5", min: 1, max: 5 },
  { key: "6-20", min: 6, max: 20 },
  { key: "21-50", min: 21, max: 50 },
  { key: "51+", min: 51, max: Infinity },
] as const;
export const tierOf = (orders: number) => Math.max(0, TIERS.findIndex((t) => orders >= t.min && orders <= t.max));

export interface StoreInput {
  store_id: string;
  store_number: string;
  store_name: string;
  organization_name: string;
  city: string;
  postal_code: string;
  first_order_date: string;
  last_order_date: string;
  orders_12m: number;
  orders_90d: number;
  orders_prev_90d: number;
  spend_12m: number;
}

export interface StoreSkuInput {
  store_id: string;
  sku: string;
  cases: number;
  last_order_date: string;
}

export interface Price {
  price: number;
  promo: boolean;
  margin?: number;
}

export interface ItemOut {
  id: string;
  item: string;
  department: string;
  category: string;
  priority: Priority;
  type: "Branded" | "Slot";
  /** Recommended SKU: the leaf's approved SKU bought by the most liquor stores. */
  sku: string;
  title: string;
  case_pack: string;
  price?: number;
  promo?: boolean;
  margin?: number;
  /** Per tier: share of the tier's stores that bought the item in 12 months, and the median
   *  cases a year among those that did. */
  tiers: { adoption: number; typical_cases: number }[];
  /** Share of all stores that bought it. */
  adoption: number;
  /** Active stores that have not bought it in 90 days, and the summed expected revenue there. */
  active_voids: number;
  opportunity: number;
}

export type Trend = "up" | "down" | "flat" | "new" | "none";

export interface StoreOut {
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
  /** Items bought in 12 months, per priority. */
  must: number;
  should: number;
  nice: number;
  /** 0–100: must, should and nice coverage weighted 3:2:1. */
  score: number;
  /** Must coverage minus the tier's median must coverage, in percentage points. */
  vs_peers: number;
  /** Coverage per department, in `departments` order (0–1). */
  departments: number[];
  /** Items not bought in 90 days (never in 12 months, or fading), per priority. */
  voids: { must: number; should: number; nice: number };
  fading: number;
  /** The three must voids most bought by the store's tier (item indexes). */
  top_voids: number[];
  /** Expected revenue a year from must and should voids: Σ tier adoption × typical cases × price,
   *  each recommended SKU counted once. */
  opportunity: number;
  /** Item indexes bought in the last 90 days. */
  bought: number[];
  /** Items bought in 12 months but not 90 days: [item index, days since last bought]. */
  fading_items: [number, number][];
}

export interface StoreFile {
  schema_version: 1;
  store_type: string;
  as_of: string;
  active_days: number;
  tiers: string[];
  departments: string[];
  totals: { must: number; should: number; nice: number };
  /** Tier medians of must coverage (0–1). */
  tier_median_must: number[];
  items: ItemOut[];
  stores: StoreOut[];
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function trendOf(recent: number, previous: number): Trend {
  if (recent === 0 && previous === 0) return "none";
  if (previous === 0) return "new";
  const r = recent / previous;
  return r >= 1.2 ? "up" : r <= 0.8 ? "down" : "flat";
}

const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

export interface ScoreInput {
  asOf: string;
  storeType: string;
  leaves: LeafInfo[];
  /** Approved matches: SKU, leaf, title, case pack and 12-month store share. */
  approved: { node_id: string; sku: string; title: string; case_pack: string; share_12m: number }[];
  stores: StoreInput[];
  storeSkus: StoreSkuInput[];
  prices: Map<string, Price> | null;
}

export function scoreStores(input: ScoreInput): StoreFile {
  const { asOf } = input;
  // Items Mercaso can supply: carried leaves with at least one approved SKU.
  const byLeaf = new Map<string, ScoreInput["approved"]>();
  for (const a of input.approved) {
    const list = byLeaf.get(a.node_id) ?? [];
    list.push(a);
    byLeaf.set(a.node_id, list);
  }
  const leaves = input.leaves.filter((l) => byLeaf.has(l.id));
  const itemIndex = new Map(leaves.map((l, i) => [l.id, i]));
  const skuItems = new Map<string, number[]>();
  for (const a of input.approved) {
    const i = itemIndex.get(a.node_id);
    if (i === undefined) continue;
    skuItems.set(a.sku, [...(skuItems.get(a.sku) ?? []), i]);
  }
  const departments = [...new Set(leaves.map((l) => l.department))];
  const deptOf = leaves.map((l) => departments.indexOf(l.department));
  const prioOf = leaves.map((l) => l.priority as Priority);
  const totals = { must: 0, should: 0, nice: 0 };
  for (const p of prioOf) totals[p]++;
  const deptTotals = departments.map((_, d) => deptOf.filter((x) => x === d).length);

  // Per store and item: cases in 12 months and the last purchase date.
  const storeItems = new Map<string, Map<number, { cases: number; last: string }>>();
  for (const r of input.storeSkus) {
    const items = skuItems.get(r.sku);
    if (!items) continue;
    let m = storeItems.get(r.store_id);
    if (!m) storeItems.set(r.store_id, (m = new Map()));
    for (const i of items) {
      const cur = m.get(i) ?? { cases: 0, last: "" };
      cur.cases += r.cases;
      if (r.last_order_date > cur.last) cur.last = r.last_order_date;
      m.set(i, cur);
    }
  }

  const tierOfStore = input.stores.map((s) => tierOf(s.orders_12m));
  const tierSizes = TIERS.map((_, t) => tierOfStore.filter((x) => x === t).length);

  // Item adoption and typical volume per tier.
  const items: ItemOut[] = leaves.map((l, i) => {
    const matches = [...byLeaf.get(l.id)!].sort((a, b) => b.share_12m - a.share_12m);
    const rec = matches[0]!;
    const price = input.prices?.get(rec.sku);
    const perTier = TIERS.map(() => [] as number[]);
    input.stores.forEach((s, k) => {
      const got = storeItems.get(s.store_id)?.get(i);
      if (got) perTier[tierOfStore[k]!]!.push(got.cases);
    });
    const buyers = perTier.reduce((a, t) => a + t.length, 0);
    return {
      id: l.id,
      item: l.item,
      department: l.department,
      category: l.item.split(" › ")[0] ?? "",
      priority: l.priority as Priority,
      type: l.kind,
      sku: rec.sku,
      title: rec.title,
      case_pack: rec.case_pack,
      ...(price ? { price: price.price, promo: price.promo, ...(price.margin !== undefined ? { margin: price.margin } : {}) } : {}),
      tiers: perTier.map((cases, t) => ({
        adoption: tierSizes[t] ? round(cases.length / tierSizes[t]!) : 0,
        typical_cases: round(median(cases), 1),
      })),
      adoption: input.stores.length ? round(buyers / input.stores.length) : 0,
      active_voids: 0,
      opportunity: 0,
    };
  });

  const expected = (i: number, tier: number) => {
    const it = items[i]!;
    const t = it.tiers[tier]!;
    return it.price === undefined ? 0 : t.adoption * t.typical_cases * it.price;
  };

  const stores: StoreOut[] = input.stores.map((s, k) => {
    const tier = tierOfStore[k]!;
    const got = storeItems.get(s.store_id) ?? new Map<number, { cases: number; last: string }>();
    const bought12 = { must: 0, should: 0, nice: 0 };
    const deptBought = departments.map(() => 0);
    const bought: number[] = [];
    const fadingItems: [number, number][] = [];
    for (const [i, g] of got) {
      bought12[prioOf[i]!]++;
      deptBought[deptOf[i]!]!++;
      const ago = daysBetween(g.last, asOf);
      if (ago <= 90) bought.push(i);
      else fadingItems.push([i, ago]);
    }
    bought.sort((a, b) => a - b);
    fadingItems.sort((a, b) => a[0] - b[0]);
    const recent = new Set(bought);
    const voids = { must: 0, should: 0, nice: 0 };
    let opportunity = 0;
    const mustVoids: number[] = [];
    // Two items can share one SKU (a cigarette pack and carton); count its revenue once.
    const counted = new Set<string>();
    items.forEach((it, i) => {
      if (recent.has(i)) return;
      const p = prioOf[i]!;
      voids[p]++;
      if (p === "must") mustVoids.push(i);
      if (p !== "nice" && !counted.has(it.sku)) {
        counted.add(it.sku);
        opportunity += expected(i, tier);
      }
    });
    mustVoids.sort((a, b) => items[b]!.tiers[tier]!.adoption - items[a]!.tiers[tier]!.adoption);
    const cov = (p: Priority) => (totals[p] ? bought12[p] / totals[p] : 0);
    const days = daysBetween(s.last_order_date, asOf);
    return {
      id: s.store_id,
      number: s.store_number,
      name: s.store_name,
      organization: s.organization_name,
      city: s.city,
      zip: s.postal_code,
      status: days <= ACTIVE_DAYS ? "Active" : "Inactive",
      days_since_order: days,
      first_order: s.first_order_date,
      last_order: s.last_order_date,
      tier,
      orders_12m: s.orders_12m,
      orders_90d: s.orders_90d,
      orders_prev_90d: s.orders_prev_90d,
      trend: trendOf(s.orders_90d, s.orders_prev_90d),
      spend_12m: s.spend_12m,
      ...bought12,
      score: round(((3 * cov("must") + 2 * cov("should") + cov("nice")) / 6) * 100, 1),
      vs_peers: 0,
      departments: deptBought.map((b, d) => (deptTotals[d] ? round(b / deptTotals[d]!, 3) : 0)),
      voids,
      fading: fadingItems.length,
      top_voids: mustVoids.slice(0, 3),
      opportunity: Math.round(opportunity),
      bought,
      fading_items: fadingItems,
    };
  });

  // Peer comparison: must coverage against the tier median.
  const tierMedian = TIERS.map((_, t) => median(stores.filter((s) => s.tier === t).map((s) => (totals.must ? s.must / totals.must : 0))));
  for (const s of stores) s.vs_peers = round(((totals.must ? s.must / totals.must : 0) - tierMedian[s.tier]!) * 100, 1);

  // Item view for pricing: voids at active stores and the expected revenue there.
  for (const s of stores) {
    if (s.status !== "Active") continue;
    const recent = new Set(s.bought);
    items.forEach((it, i) => {
      if (recent.has(i)) return;
      it.active_voids++;
      it.opportunity += expected(i, s.tier);
    });
  }
  for (const it of items) it.opportunity = Math.round(it.opportunity);

  return {
    schema_version: 1,
    store_type: input.storeType,
    as_of: asOf,
    active_days: ACTIVE_DAYS,
    tiers: TIERS.map((t) => t.key),
    departments,
    totals,
    tier_median_must: tierMedian.map((m) => round(m)),
    items,
    stores,
  };
}
