// Member discounts: find master-catalog items that few member stores buy from Mercaso and give
// members an extra per-case discount on their SKUs, never below a 5% margin. Pure logic for
// `pnpm member-discount`; see docs/exploration/member-discount.md for the rule and decisions.
//
// Penetration is measured per catalog item (a store that buys any approved SKU of the item counts)
// with the store view's scoring (`buildBase` + `scoreWindow`), over the member stores of one store
// type. The discount then applies to every approved SKU of the item, each checked against its own
// price and cost.
import type { LeafInfo } from "../match/review-lib.ts";
import { buildBase, scoreWindow, type StoreInput, type StoreSkuInput } from "../stores/lib.ts";
import { round, type Priority } from "../../apps/web/lib/score.ts";

/** Penetration bands, lowest first: the first band whose limit the penetration is under wins. */
export const BANDS = [
  { under: 0.05, discount: 2 },
  { under: 0.1, discount: 1 },
  { under: 0.15, discount: 0.5 },
] as const;
export const MARGIN_FLOOR = 0.05;

export type Exclusion =
  | "penetration_15pct_plus"
  | "supply_hold"
  | "no_sales"
  | "no_price"
  | "no_cost"
  | "margin_floor";

export interface MemberStore {
  store_id: string;
  store_type: string;
  member: boolean;
  last_order_date: string;
  orders_90d: number;
}

export interface SkuPrice {
  price: number;
  promo: boolean;
  regular_price: number;
  /** Average case cost without CRV; undefined when Finale has none. */
  cost?: number;
  /** Existing per-case member discount (dw.ods_ims_item.membership_discount). */
  member_discount: number;
}

export interface Approved {
  node_id: string;
  sku: string;
  title: string;
  case_pack: string;
  share_12m: number;
}

export interface MemberDiscountInput {
  asOf: string;
  leaves: LeafInfo[];
  approved: Approved[];
  stores: MemberStore[];
  /** Store × SKU purchases (cases and last order date); rows older than the window are ignored. */
  storeSkus: StoreSkuInput[];
  prices: Map<string, SkuPrice>;
  holds?: Record<string, { reason: string; since: string }>;
  /** The store type the catalog is built for; penetration is measured over its member stores. */
  storeType: string;
  windowDays: number;
  priorities: Priority[];
}

export interface SkuRow {
  department: string;
  category: string;
  item: string;
  node_id: string;
  priority: Priority;
  /** Other catalog items that share this SKU (a cigarette pack and carton). */
  also_in: string[];
  sku: string;
  title: string;
  case_pack: string;
  /** Share of the store type's member stores that bought the item (any approved SKU) in the window. */
  member_pen: number;
  member_buyers: number;
  /** Share of the store type's non-member stores, among those that ordered in the window. */
  nonmember_pen: number;
  nonmember_buyers: number;
  /** Share of all member stores (every store type). */
  all_member_pen: number;
  /** Share of the store type's member stores that bought this SKU itself. */
  sku_member_pen: number;
  /** The band's discount (0 when 15% or more). */
  band: number;
  price?: number;
  promo?: boolean;
  regular_price?: number;
  cost?: number;
  existing_member_discount: number;
  margin_before?: number;
  /** Largest discount the margin floor allows, in whole cents (can be negative). */
  max_discount?: number;
  /** The discount after stepping down to fit the floor; 0 when excluded. */
  discount: number;
  stepped_down: boolean;
  margin_after?: number;
  excluded?: Exclusion;
  /** Bought by stores in the window, but by none of the store type's members. */
  no_member_buyers: boolean;
  /** Cases bought in the window by the store type's members and by all members. */
  member_cases: number;
  all_member_cases: number;
}

/** Largest discount that keeps (price − existing − discount − cost) ÷ (price − existing − discount) ≥ floor. */
export function maxDiscount(price: number, cost: number, existing = 0, floor = MARGIN_FLOOR): number {
  return Math.floor((price - existing - cost / (1 - floor)) * 100 + 1e-6) / 100;
}

export function bandFor(penetration: number): number {
  return BANDS.find((b) => penetration < b.under)?.discount ?? 0;
}

/** The band's discount, stepped down through the smaller bands until it fits; 0 when none fits. */
export function stepDown(band: number, allowed: number): number {
  return BANDS.map((b) => b.discount).find((d) => d <= band && d <= allowed + 1e-9) ?? 0;
}

const margin = (price: number, cost: number) => (price > 0 ? (price - cost) / price : 0);

/** Item penetration for a group of stores, through the store view's scoring. */
function penetration(input: MemberDiscountInput, stores: MemberStore[]) {
  const ids = new Set(stores.map((s) => s.store_id));
  const base = buildBase({
    asOf: input.asOf,
    storeType: input.storeType,
    leaves: input.leaves,
    approved: input.approved,
    stores: stores.map((s): StoreInput => ({
      store_id: s.store_id,
      store_number: "",
      store_name: "",
      organization_name: "",
      city: "",
      postal_code: "",
      first_order_date: "",
      last_order_date: s.last_order_date || input.asOf,
      orders_12m: s.orders_90d,
      orders_90d: s.orders_90d,
      orders_prev_90d: 0,
      spend_12m: 0,
    })),
    storeSkus: input.storeSkus.filter((r) => ids.has(r.store_id)),
    prices: null,
    holds: input.holds ?? {},
  });
  const scored = scoreWindow(base, input.windowDays);
  return new Map(scored.items.map((it) => [it.id, { share: it.adoption, buyers: Math.round(it.adoption * stores.length), hold: it.hold }]));
}

export function memberDiscounts(input: MemberDiscountInput): SkuRow[] {
  const since = new Date(Date.parse(input.asOf) - input.windowDays * 86_400_000).toISOString().slice(0, 10);
  const recent = input.storeSkus.filter((r) => r.last_order_date >= since);
  const scoped = { ...input, storeSkus: recent };

  const members = input.stores.filter((s) => s.member && s.store_type === input.storeType);
  const others = input.stores.filter((s) => !s.member && s.store_type === input.storeType && s.orders_90d > 0);
  const allMembers = input.stores.filter((s) => s.member);
  const pen = penetration(scoped, members);
  const nonPen = penetration(scoped, others);
  const allPen = penetration(scoped, allMembers);

  // Per SKU: buyers among the store type's members, and member cases.
  const memberIds = new Set(members.map((s) => s.store_id));
  const allMemberIds = new Set(allMembers.map((s) => s.store_id));
  const anyBuyer = new Set<string>();
  const skuBuyers = new Map<string, Set<string>>();
  const cases = new Map<string, { member: number; all: number }>();
  for (const r of recent) {
    anyBuyer.add(r.sku);
    const c = cases.get(r.sku) ?? { member: 0, all: 0 };
    if (memberIds.has(r.store_id)) {
      c.member += r.cases;
      skuBuyers.set(r.sku, (skuBuyers.get(r.sku) ?? new Set()).add(r.store_id));
    }
    if (allMemberIds.has(r.store_id)) c.all += r.cases;
    cases.set(r.sku, c);
  }

  const leafById = new Map(input.leaves.map((l) => [l.id, l]));
  const rows: SkuRow[] = [];
  for (const a of input.approved) {
    const leaf = leafById.get(a.node_id);
    const p = pen.get(a.node_id);
    if (!leaf || !p || !input.priorities.includes(leaf.priority as Priority)) continue;
    const itemSkus = input.approved.filter((x) => x.node_id === a.node_id).map((x) => x.sku);
    const sold = itemSkus.some((s) => anyBuyer.has(s));
    const band = bandFor(p.share);
    const price = input.prices.get(a.sku);
    const existing = price?.member_discount ?? 0;
    const row: SkuRow = {
      department: leaf.department,
      category: leaf.item.split(" › ")[0] ?? "",
      item: leaf.item,
      node_id: leaf.id,
      priority: leaf.priority as Priority,
      also_in: [],
      sku: a.sku,
      title: a.title,
      case_pack: a.case_pack,
      member_pen: p.share,
      member_buyers: p.buyers,
      nonmember_pen: nonPen.get(a.node_id)?.share ?? 0,
      nonmember_buyers: nonPen.get(a.node_id)?.buyers ?? 0,
      all_member_pen: allPen.get(a.node_id)?.share ?? 0,
      sku_member_pen: members.length ? round((skuBuyers.get(a.sku)?.size ?? 0) / members.length) : 0,
      band,
      ...(price ? { price: price.price, promo: price.promo, regular_price: price.regular_price } : {}),
      ...(price?.cost !== undefined ? { cost: price.cost } : {}),
      existing_member_discount: existing,
      discount: 0,
      stepped_down: false,
      no_member_buyers: sold && p.buyers === 0,
      member_cases: cases.get(a.sku)?.member ?? 0,
      all_member_cases: cases.get(a.sku)?.all ?? 0,
    };
    if (price && price.price > 0 && price.cost !== undefined) {
      row.margin_before = round(margin(price.price - existing, price.cost));
      row.max_discount = maxDiscount(price.price, price.cost, existing);
    }

    if (band === 0) row.excluded = "penetration_15pct_plus";
    else if (p.hold) row.excluded = "supply_hold";
    else if (!sold) row.excluded = "no_sales";
    else if (!price || !(price.price > 0)) row.excluded = "no_price";
    else if (price.cost === undefined) row.excluded = "no_cost";
    else {
      const d = stepDown(band, row.max_discount!);
      if (d === 0) row.excluded = "margin_floor";
      else {
        row.discount = d;
        row.stepped_down = d < band;
        row.margin_after = round(margin(price.price - existing - d, price.cost));
      }
    }
    rows.push(row);
  }

  // One decision per SKU: a SKU on two items (pack and carton) follows the item more members buy,
  // the more conservative band.
  const bySku = new Map<string, SkuRow[]>();
  for (const r of rows) bySku.set(r.sku, [...(bySku.get(r.sku) ?? []), r]);
  const out: SkuRow[] = [];
  for (const group of bySku.values()) {
    const [keep, ...rest] = [...group].sort((x, y) => y.member_pen - x.member_pen);
    keep!.also_in = rest.map((r) => r.item);
    out.push(keep!);
  }
  const order = new Map(input.leaves.map((l, i) => [l.id, i]));
  return out.sort((x, y) => order.get(x.node_id)! - order.get(y.node_id)! || x.sku.localeCompare(y.sku));
}

export interface Summary {
  members: number;
  all_members: number;
  nonmembers: number;
  items: number;
  skus: number;
  /** SKUs per final discount (2, 1, 0.5). */
  by_discount: Record<string, number>;
  by_discount_promo: Record<string, number>;
  stepped_down: number;
  excluded: Record<string, number>;
  no_member_buyers: number;
  /** Discount × cases in the window, at current volumes (no lift assumed). */
  cost_window_members: number;
  cost_window_all_members: number;
}

export function summarize(rows: SkuRow[], counts: { members: number; all_members: number; nonmembers: number }): Summary {
  const by: Record<string, number> = { "2": 0, "1": 0, "0.5": 0 };
  const byPromo: Record<string, number> = { "2": 0, "1": 0, "0.5": 0 };
  const excluded: Record<string, number> = {};
  let cm = 0;
  let ca = 0;
  for (const r of rows) {
    if (r.discount === 0) excluded[r.excluded ?? "none"] = (excluded[r.excluded ?? "none"] ?? 0) + 1;
    else {
      by[String(r.discount)]!++;
      if (r.promo) byPromo[String(r.discount)]!++;
    }
    cm += r.discount * r.member_cases;
    ca += r.discount * r.all_member_cases;
  }
  return {
    ...counts,
    items: new Set(rows.map((r) => r.node_id)).size,
    skus: rows.length,
    by_discount: by,
    by_discount_promo: byPromo,
    stepped_down: rows.filter((r) => r.stepped_down).length,
    excluded,
    no_member_buyers: rows.filter((r) => r.no_member_buyers).length,
    cost_window_members: Math.round(cm),
    cost_window_all_members: Math.round(ca),
  };
}

/** A wave: SKUs and discounts Rick approved to run, frozen in data/member-discount/. */
export interface WaveEntry {
  sku: string;
  discount: number;
}

export type WaveCheck = "ok" | "band_changed" | "floor_breaks";

export interface WaveRow extends SkuRow {
  /** The discount the scoring gives today (0 when excluded); `discount` holds the wave's. */
  recomputed_discount: number;
  /** ok; band_changed: today's scoring gives another amount, the wave's still fits the floor;
   *  floor_breaks: at today's price and cost the wave's discount breaks the 5% margin. */
  check: WaveCheck;
}

/**
 * Re-checks a wave against today's scoring: the wave's discount stays (it is the decision), but a
 * SKU whose price or cost moved so the discount breaks the floor, or whose band moved, is flagged.
 * SKUs no longer scored (not approved any more) come back in `missing`.
 */
export function checkWave(rows: SkuRow[], wave: WaveEntry[]): { rows: WaveRow[]; missing: string[] } {
  const bySku = new Map(rows.map((r) => [r.sku, r]));
  const out: WaveRow[] = [];
  const missing: string[] = [];
  for (const w of wave) {
    const r = bySku.get(w.sku);
    if (!r) {
      missing.push(w.sku);
      continue;
    }
    const fits = r.max_discount !== undefined && w.discount <= r.max_discount + 1e-9;
    const net = r.price === undefined ? undefined : r.price - r.existing_member_discount - w.discount;
    out.push({
      ...r,
      discount: w.discount,
      recomputed_discount: r.discount,
      stepped_down: r.band > 0 && w.discount < r.band,
      ...(net !== undefined && r.cost !== undefined && net > 0 ? { margin_after: round((net - r.cost) / net) } : {}),
      check: !fits ? "floor_breaks" : r.discount !== w.discount ? "band_changed" : "ok",
    });
  }
  return { rows: out, missing };
}
