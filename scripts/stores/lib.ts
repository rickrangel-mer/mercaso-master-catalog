// Store view: how much of the master catalog each store buys from Mercaso. `buildBase` turns the
// exports into the base file the site loads; the scoring for a "carried" window lives in
// apps/web/lib/score.ts, shared with the site. See docs/exploration/store-penetration.md.
import { DEFAULT_WINDOW_DAYS, median, round, scoreWindow, type BaseFile, type BaseItem, type BaseStore, type Priority, type StoreFile, type Trend } from "../../apps/web/lib/score.ts";
import type { LeafInfo } from "../match/review-lib.ts";

export { DEFAULT_WINDOW_DAYS, median, scoreWindow };
export type { BaseFile, ItemOut, StoreFile, StoreOut } from "../../apps/web/lib/score.ts";

export const ACTIVE_DAYS = 45;

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

/**
 * Store text that reaches the site must not carry contact details. Mercaso's organization name is
 * often the owner's email, and a few store names include one; emails are removed.
 */
export function withoutContact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "")
    .replace(/\s*[-–|,(]*\s*\)?\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export function trendOf(recent: number, previous: number): Trend {
  if (recent === 0 && previous === 0) return "none";
  if (previous === 0) return "new";
  const r = recent / previous;
  return r >= 1.2 ? "up" : r <= 0.8 ? "down" : "flat";
}


export interface ScoreInput {
  asOf: string;
  storeType: string;
  leaves: LeafInfo[];
  /** Approved matches: SKU, leaf, title, case pack and 12-month store share. */
  approved: { node_id: string; sku: string; title: string; case_pack: string; share_12m: number }[];
  stores: StoreInput[];
  storeSkus: StoreSkuInput[];
  prices: Map<string, Price> | null;
  /** Supply holds from the store-type file: node id (a whole subtree) to reason and date. */
  holds?: Record<string, { reason: string; since: string }>;
}

/** The base file: catalog items with a Mercaso SKU, and each store with its days since last
 *  buying each item. Everything window-dependent is left to `scoreWindow`. */
export function buildBase(input: ScoreInput): BaseFile {
  const { asOf } = input;
  // Items Mercaso can supply: carried leaves with at least one approved SKU.
  const byLeaf = new Map<string, ScoreInput["approved"]>();
  for (const a of input.approved) byLeaf.set(a.node_id, [...(byLeaf.get(a.node_id) ?? []), a]);
  const leaves = input.leaves.filter((l) => byLeaf.has(l.id));
  const itemIndex = new Map(leaves.map((l, i) => [l.id, i]));
  const skuItems = new Map<string, number[]>();
  for (const a of input.approved) {
    const i = itemIndex.get(a.node_id);
    if (i !== undefined) skuItems.set(a.sku, [...(skuItems.get(a.sku) ?? []), i]);
  }
  const departments = [...new Set(leaves.map((l) => l.department))];
  const totals = { must: 0, should: 0, nice: 0 };
  for (const l of leaves) totals[l.priority as Priority]++;

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

  const items: BaseItem[] = leaves.map((l, i) => {
    const rec = [...byLeaf.get(l.id)!].sort((a, b) => b.share_12m - a.share_12m)[0]!;
    const price = input.prices?.get(rec.sku);
    const perTier = TIERS.map(() => [] as number[]);
    input.stores.forEach((s, k) => {
      const got = storeItems.get(s.store_id)?.get(i);
      if (got) perTier[tierOfStore[k]!]!.push(got.cases);
    });
    const holdId = Object.keys(input.holds ?? {}).find((h) => l.id === h || l.id.startsWith(`${h}.`));
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
      ...(price ? { price: price.price, promo: price.promo, ...(price.margin !== undefined ? { margin: round(price.margin) } : {}) } : {}),
      typical_cases: perTier.map((cases) => round(median(cases), 1)),
      ...(holdId ? { hold: input.holds![holdId]! } : {}),
    };
  });

  const stores: BaseStore[] = input.stores.map((s, k) => {
    const got = storeItems.get(s.store_id) ?? new Map<number, { cases: number; last: string }>();
    const days = daysBetween(s.last_order_date, asOf);
    return {
      id: s.store_id,
      number: s.store_number,
      name: withoutContact(s.store_name),
      organization: withoutContact(s.organization_name),
      city: s.city,
      zip: s.postal_code,
      status: days <= ACTIVE_DAYS ? "Active" : "Inactive",
      days_since_order: days,
      first_order: s.first_order_date,
      last_order: s.last_order_date,
      tier: tierOfStore[k]!,
      orders_12m: s.orders_12m,
      orders_90d: s.orders_90d,
      orders_prev_90d: s.orders_prev_90d,
      trend: trendOf(s.orders_90d, s.orders_prev_90d),
      spend_12m: s.spend_12m,
      last_bought: [...got].map(([i, g]): [number, number] => [i, daysBetween(g.last, asOf)]).sort((a, b) => a[0] - b[0]),
    };
  });

  return {
    schema_version: 2,
    store_type: input.storeType,
    as_of: asOf,
    active_days: ACTIVE_DAYS,
    default_window_days: DEFAULT_WINDOW_DAYS,
    tiers: TIERS.map((t) => t.key),
    departments,
    totals,
    items,
    stores,
  };
}

/** The base file scored for a window (default 90 days). */
export function scoreStores(input: ScoreInput & { windowDays?: number }): StoreFile {
  return scoreWindow(buildBase(input), input.windowDays ?? DEFAULT_WINDOW_DAYS);
}
