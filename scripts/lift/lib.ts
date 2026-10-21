// Penetration lift: the yearly Mercaso sales gained if more active stores buy the catalog items
// they don't buy yet. Pure logic for `pnpm lift`; the method and Rick's decisions are in
// docs/exploration/penetration-lift.md.
//
// Everything is per active store × catalog item. Each store is compared with its peer group: its
// own store type and order tier (the store view's tiers), or the whole store type when the tier is
// small. Volumes are in units (cases × case pack), so case packs of one item add up.
import { median, round, type Priority } from "../../apps/web/lib/score.ts";
import type { LeafInfo } from "../match/review-lib.ts";
import { ACTIVE_DAYS, TIERS, tierOf } from "../stores/lib.ts";

export const WINDOW_DAYS = 90;
/** A tier with fewer active stores than this is pooled with its store type. */
export const MIN_GROUP = 20;
/** A typical volume needs at least this many buyers; otherwise the store type's is used. */
export const MIN_BUYERS = 3;
export const TOP_SHARE = 0.25;
export const SCENARIOS = ["catch_up", "plus_5", "plus_10"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export interface Catalog {
  key: string;
  leaves: LeafInfo[];
  /** Approved matches: SKU, item, case pack and the share of the type's stores buying it (ranks the recommended SKU). */
  approved: { node_id: string; sku: string; case_pack: number; share_12m: number }[];
  holds?: Record<string, { reason: string; since: string }>;
}

export interface Store {
  id: string;
  /** Store type as exported; "" when none is set. */
  type: string;
  number: string;
  name: string;
  city: string;
  last_order_date: string;
  orders_12m: number;
}

export interface StoreSku {
  store_id: string;
  sku: string;
  cases: number;
  last_order_date: string;
}

export interface Price {
  /** Case price without CRV (promo price when on promo) and average case cost without CRV. */
  price: number;
  cost?: number;
}

export interface LiftInput {
  asOf: string;
  catalogs: Catalog[];
  /** Store type -> catalog key; types not listed are not covered. "" is "no type set". */
  typeCatalog: Record<string, string>;
  stores: Store[];
  storeSkus: StoreSku[];
  prices: Map<string, Price>;
}

export interface ItemInfo {
  id: string;
  item: string;
  department: string;
  priority: Priority;
  hold: boolean;
  /** Recommended SKU with a price: unit price and unit cost. */
  sku?: string;
  unitPrice?: number;
  unitCost?: number;
}

/** One peer group's numbers for one item. */
export interface GroupItem {
  item: number;
  /** Share of the group's active stores that bought it in the window. */
  penetration: number;
  /** Share among the group's best-assorted quarter. */
  top: number;
  /** Median units a year among buyers. */
  typical: number;
}

export interface Group {
  key: string;
  catalog: string;
  type: string;
  /** Tier index, or -1 when the whole store type is pooled. */
  tier: number;
  stores: number[];
  items: GroupItem[];
}

export interface LiftModel {
  catalogs: Map<string, ItemInfo[]>;
  groups: Group[];
  /** Index into `stores` -> group index; covered active stores only. */
  storeGroup: Map<number, number>;
  /** Per covered active store: item indexes bought in the window. */
  bought: Map<number, Set<number>>;
  stores: Store[];
  /** Typical units per catalog, store type and item (for the back-test). */
  typeTypical: Map<string, number>;
  /** Per covered active store: units bought in 12 months per item. */
  units: Map<number, Map<number, number>>;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
export const isActive = (s: Store, asOf: string) => s.last_order_date !== "" && daysBetween(s.last_order_date, asOf) <= ACTIVE_DAYS;
export const typeName = (type: string) => type || "No type set";

/** Item list for a catalog: carried leaves with an approved SKU, and the recommended SKU's unit price. */
export function catalogItems(c: Catalog, prices: Map<string, Price>): ItemInfo[] {
  const byLeaf = new Map<string, Catalog["approved"]>();
  for (const a of c.approved) {
    const list = byLeaf.get(a.node_id) ?? [];
    list.push(a);
    byLeaf.set(a.node_id, list);
  }
  return c.leaves
    .filter((l) => byLeaf.has(l.id))
    .map((l) => {
      const rec = [...byLeaf.get(l.id)!].sort((a, b) => b.share_12m - a.share_12m).find((a) => (prices.get(a.sku)?.price ?? 0) > 0);
      const p = rec ? prices.get(rec.sku)! : undefined;
      const hold = Object.keys(c.holds ?? {}).some((h) => l.id === h || l.id.startsWith(`${h}.`));
      return {
        id: l.id,
        item: l.item,
        department: l.department,
        priority: l.priority as Priority,
        hold,
        ...(rec && p
          ? { sku: rec.sku, unitPrice: p.price / rec.case_pack, ...(p.cost !== undefined ? { unitCost: p.cost / rec.case_pack } : {}) }
          : {}),
      };
    });
}

/** Catalog score as in the store view: must, should and nice coverage weighted 3:2:1 (0–1). */
function scoreOf(bought: Set<number>, items: ItemInfo[], totals: Record<Priority, number>): number {
  const n = { must: 0, should: 0, nice: 0 };
  for (const i of bought) n[items[i]!.priority]++;
  const cov = (p: Priority) => (totals[p] ? n[p] / totals[p] : 0);
  return (3 * cov("must") + 2 * cov("should") + cov("nice")) / 6;
}

export function buildModel(input: LiftInput): LiftModel {
  const catalogs = new Map(input.catalogs.map((c) => [c.key, catalogItems(c, input.prices)]));
  // SKU -> (item, case pack) per catalog.
  const skuItems = new Map<string, Map<string, { item: number; pack: number }[]>>();
  for (const c of input.catalogs) {
    const index = new Map(catalogs.get(c.key)!.map((it, i) => [it.id, i]));
    const m = new Map<string, { item: number; pack: number }[]>();
    for (const a of c.approved) {
      const i = index.get(a.node_id);
      if (i === undefined) continue;
      const list = m.get(a.sku) ?? [];
      list.push({ item: i, pack: Math.max(1, a.case_pack) });
      m.set(a.sku, list);
    }
    skuItems.set(c.key, m);
  }

  // Covered active stores and, per store, units in 12 months and the last purchase per item.
  const covered: number[] = [];
  input.stores.forEach((s, k) => {
    if (input.typeCatalog[s.type] !== undefined && isActive(s, input.asOf)) covered.push(k);
  });
  const storeIndex = new Map(covered.map((k) => [input.stores[k]!.id, k]));
  const usage = new Map<number, Map<number, { units: number; last: string }>>();
  for (const r of input.storeSkus) {
    const k = storeIndex.get(r.store_id);
    if (k === undefined) continue;
    const list = skuItems.get(input.typeCatalog[input.stores[k]!.type]!)!.get(r.sku);
    if (!list) continue;
    let m = usage.get(k);
    if (!m) usage.set(k, (m = new Map()));
    for (const { item, pack } of list) {
      const u = m.get(item) ?? { units: 0, last: "" };
      u.units += r.cases * pack;
      if (r.last_order_date > u.last) u.last = r.last_order_date;
      m.set(item, u);
    }
  }
  const bought = new Map<number, Set<number>>();
  for (const k of covered) {
    const set = new Set<number>();
    for (const [i, u] of usage.get(k) ?? []) if (daysBetween(u.last, input.asOf) <= WINDOW_DAYS) set.add(i);
    bought.set(k, set);
  }

  // Peer groups: store type × tier, pooled to the store type when a tier is small.
  const byTypeTier = new Map<string, number[]>();
  for (const k of covered) {
    const s = input.stores[k]!;
    const key = `${s.type}|${tierOf(s.orders_12m)}`;
    const list = byTypeTier.get(key) ?? [];
    list.push(k);
    byTypeTier.set(key, list);
  }
  const groupStores = new Map<string, { type: string; tier: number; stores: number[] }>();
  for (const [key, ks] of byTypeTier) {
    const [type, tier] = [key.slice(0, key.lastIndexOf("|")), Number(key.slice(key.lastIndexOf("|") + 1))];
    const gk = ks.length >= MIN_GROUP ? key : `${type}|all`;
    const g = groupStores.get(gk) ?? { type, tier: ks.length >= MIN_GROUP ? tier : -1, stores: [] };
    g.stores.push(...ks);
    groupStores.set(gk, g);
  }

  // Typical units a year per store type and item (the fallback for thin groups).
  const typeTypical = new Map<string, number>();
  const typeUnits = new Map<string, number[]>();
  for (const k of covered) {
    const s = input.stores[k]!;
    const cat = input.typeCatalog[s.type]!;
    for (const [i, u] of usage.get(k) ?? []) {
      const key = `${cat}|${s.type}|${i}`;
      const list = typeUnits.get(key) ?? [];
      list.push(u.units);
      typeUnits.set(key, list);
    }
  }
  for (const [key, units] of typeUnits) typeTypical.set(key, units.length >= MIN_BUYERS ? round(median(units), 2) : 0);

  const storeGroup = new Map<number, number>();
  const groups: Group[] = [...groupStores.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, g], gi) => {
      const cat = input.typeCatalog[g.type]!;
      const items = catalogs.get(cat)!;
      const totals = { must: 0, should: 0, nice: 0 };
      for (const it of items) totals[it.priority]++;
      for (const k of g.stores) storeGroup.set(k, gi);
      const score = new Map(g.stores.map((k) => [k, scoreOf(bought.get(k)!, items, totals)]));
      const ranked = [...g.stores].sort((a, b) => score.get(b)! - score.get(a)!);
      const top = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * TOP_SHARE)));
      return {
        key,
        catalog: cat,
        type: g.type,
        tier: g.tier,
        stores: g.stores,
        items: items.map((_, i) => {
          const units = g.stores.map((k) => usage.get(k)?.get(i)?.units ?? 0).filter((u) => u > 0);
          const typical = units.length >= MIN_BUYERS ? median(units) : (typeTypical.get(`${cat}|${g.type}|${i}`) ?? 0);
          return {
            item: i,
            penetration: round(g.stores.filter((k) => bought.get(k)!.has(i)).length / g.stores.length),
            top: round(top.filter((k) => bought.get(k)!.has(i)).length / top.length),
            typical: round(typical, 2),
          };
        }),
      };
    });

  const units = new Map([...usage].map(([k, m]) => [k, new Map([...m].map(([i, u]) => [i, u.units]))]));
  return { catalogs, groups, storeGroup, bought, stores: input.stores, typeTypical, units };
}

/** Target penetration for a scenario. Flat increases apply only where some store in the group buys. */
export function target(scenario: Scenario, gi: Pick<GroupItem, "penetration" | "top">): number {
  if (scenario === "catch_up") return Math.max(gi.penetration, gi.top);
  if (gi.penetration === 0) return 0;
  return Math.min(1, gi.penetration + (scenario === "plus_5" ? 0.05 : 0.1));
}

export interface LiftRow {
  catalog: string;
  type: string;
  item: number;
  stores: number;
  buyers: number;
  /** Extra stores buying under the scenario (fractional: an expected count). */
  extra: number;
  /** Gross yearly revenue and margin from those stores. */
  revenue: number;
  margin: number;
}

/** Gross lift per store type and item for a scenario (held items and items without a price add nothing). */
export function liftRows(model: LiftModel, scenario: Scenario): LiftRow[] {
  const rows = new Map<string, LiftRow>();
  for (const g of model.groups) {
    const items = model.catalogs.get(g.catalog)!;
    const n = g.stores.length;
    for (const gi of g.items) {
      const it = items[gi.item]!;
      const extra = it.hold || it.unitPrice === undefined ? 0 : Math.max(0, target(scenario, gi) - gi.penetration) * n;
      const key = `${g.catalog}|${g.type}|${gi.item}`;
      const row = rows.get(key) ?? { catalog: g.catalog, type: g.type, item: gi.item, stores: 0, buyers: 0, extra: 0, revenue: 0, margin: 0 };
      row.stores += n;
      row.buyers += Math.round(gi.penetration * n);
      row.extra += extra;
      row.revenue += extra * gi.typical * (it.unitPrice ?? 0);
      row.margin += extra * gi.typical * (it.unitPrice !== undefined && it.unitCost !== undefined ? it.unitPrice - it.unitCost : 0);
      rows.set(key, row);
    }
  }
  return [...rows.values()];
}

export interface StoreLift {
  store: number;
  group: number;
  revenue: number;
  margin: number;
  /** Gap items by expected value: [item index, expected revenue]. */
  gaps: [number, number][];
}

/**
 * Each gap store's expected share of its group's lift: the chance of converting (the group's extra
 * stores over its gaps) × the item's value.
 */
export function storeLift(model: LiftModel, scenario: Scenario): StoreLift[] {
  const out: StoreLift[] = [];
  model.groups.forEach((g, gIndex) => {
    const items = model.catalogs.get(g.catalog)!;
    const n = g.stores.length;
    for (const k of g.stores) {
      const has = model.bought.get(k)!;
      let revenue = 0;
      let margin = 0;
      const gaps: [number, number][] = [];
      for (const gi of g.items) {
        const it = items[gi.item]!;
        if (has.has(gi.item) || it.hold || it.unitPrice === undefined) continue;
        const open = (1 - gi.penetration) * n;
        if (open <= 0) continue;
        const chance = Math.min(1, (Math.max(0, target(scenario, gi) - gi.penetration) * n) / open);
        if (chance === 0) continue;
        const r = chance * gi.typical * it.unitPrice;
        revenue += r;
        margin += chance * gi.typical * (it.unitCost !== undefined ? it.unitPrice - it.unitCost : 0);
        gaps.push([gi.item, r]);
      }
      gaps.sort((a, b) => b[1] - a[1]);
      out.push({ store: k, group: gIndex, revenue, margin, gaps });
    }
  });
  return out;
}

// --- Back-test -------------------------------------------------------------------------------

export interface Adopter {
  store_id: string;
  item: string;
  item_after: number;
}

export interface BacktestRow {
  department: string;
  /** Units in the full year from adoption. */
  actual: number;
  /** The typical yearly units the model would have used. */
  predicted: number;
}

/** Joins adopters to the model: what they bought against their peer group's typical volume. */
export function backtestRows(model: LiftModel, typeCatalog: Record<string, string>, adopters: Adopter[]): BacktestRow[] {
  const byId = new Map(model.stores.map((s, k) => [s.id, k]));
  const itemIndex = new Map([...model.catalogs].map(([c, items]) => [c, new Map(items.map((it, i) => [it.id, i]))]));
  const out: BacktestRow[] = [];
  for (const a of adopters) {
    const k = byId.get(a.store_id);
    if (k === undefined) continue;
    const s = model.stores[k]!;
    const cat = typeCatalog[s.type];
    if (cat === undefined) continue;
    const i = itemIndex.get(cat)!.get(a.item);
    if (i === undefined) continue;
    const g = model.storeGroup.get(k);
    const predicted = g !== undefined ? model.groups[g]!.items[i]!.typical : (model.typeTypical.get(`${cat}|${s.type}|${i}`) ?? 0);
    if (predicted <= 0) continue;
    out.push({ department: model.catalogs.get(cat)![i]!.department, actual: a.item_after, predicted });
  }
  return out;
}

/** Realization: the median adopter's first-year volume over the typical volume (1 = the model is right). */
export function realizationOf(rows: BacktestRow[]): number {
  return rows.length ? median(rows.map((r) => r.actual / r.predicted)) : 1;
}

/** A category needs this many stores buying from it for its own estimate. */
export const MIN_CATEGORY_STORES = 50;

export interface Incrementality {
  /** Per department, 0–1: the share of a new item's volume that is new to Mercaso. */
  byDept: Map<string, number>;
  overall: number;
  /** Uncapped ratios, for the summary. */
  raw: Map<string, number>;
}

/**
 * Substitution from the cross-section: within each catalog category, how many more units a store
 * buys per extra item it carries, holding its size equal (its units outside the category), over the
 * category's average units per item. A ratio under 1 means part of a new item's volume comes out of
 * the category's other items. Per department, categories weigh by their store count; capped at 1.
 */
export function incrementalityOf(model: LiftModel): Incrementality {
  const acc = new Map<string, { slope: number; avg: number }>();
  for (const [catKey, items] of model.catalogs) {
    const obs = new Map<string, { y: number; n: number; rest: number }[]>();
    for (const [k, m] of model.units) {
      const g = model.storeGroup.get(k);
      if (g === undefined || model.groups[g]!.catalog !== catKey) continue;
      let total = 0;
      const byCat = new Map<string, { y: number; n: number }>();
      for (const [i, u] of m) {
        total += u;
        const c = items[i]!.id.split(".").slice(0, 2).join(".");
        const x = byCat.get(c) ?? { y: 0, n: 0 };
        x.y += u;
        x.n++;
        byCat.set(c, x);
      }
      for (const [c, x] of byCat) {
        const list = obs.get(c) ?? [];
        list.push({ y: x.y, n: x.n, rest: total - x.y });
        obs.set(c, list);
      }
    }
    const deptOf = new Map(items.map((it) => [it.id.split(".").slice(0, 2).join("."), it.department]));
    for (const [c, l] of obs) {
      if (l.length < MIN_CATEGORY_STORES) continue;
      const n = l.length;
      const my = l.reduce((a, r) => a + r.y, 0) / n;
      const m1 = l.reduce((a, r) => a + r.n, 0) / n;
      const m2 = l.reduce((a, r) => a + r.rest, 0) / n;
      let s11 = 0, s22 = 0, s12 = 0, s1y = 0, s2y = 0;
      for (const r of l) {
        const a = r.n - m1, b = r.rest - m2, y = r.y - my;
        s11 += a * a; s22 += b * b; s12 += a * b; s1y += a * y; s2y += b * y;
      }
      const det = s11 * s22 - s12 * s12;
      if (det <= 0) continue;
      const slope = (s1y * s22 - s2y * s12) / det;
      const perItem = (my * n) / (m1 * n);
      const d = deptOf.get(c)!;
      const x = acc.get(d) ?? { slope: 0, avg: 0 };
      x.slope += slope * n;
      x.avg += perItem * n;
      acc.set(d, x);
    }
  }
  const raw = new Map([...acc].map(([d, x]) => [d, x.avg > 0 ? x.slope / x.avg : 1]));
  const sum = [...acc.values()].reduce((a, x) => ({ slope: a.slope + x.slope, avg: a.avg + x.avg }), { slope: 0, avg: 0 });
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  return {
    byDept: new Map([...raw].map(([d, r]) => [d, clamp01(r)])),
    overall: clamp01(sum.avg > 0 ? sum.slope / sum.avg : 1),
    raw,
  };
}

export const incrementalityFor = (inc: Incrementality, department: string) => inc.byDept.get(department) ?? inc.overall;

/** Expected lift = gross × realization × the department's incrementality (optionally capped). */
export function expected(gross: { department: string; value: number }[], realization: number, inc: Incrementality, incCap = 1): number {
  return gross.reduce((a, g) => a + g.value * realization * Math.min(incCap, incrementalityFor(inc, g.department)), 0);
}

/** High realization: the mean adopter, with heavy buyers capped at `cap` times the typical volume. */
export function realizationHigh(rows: BacktestRow[], cap = 2): number {
  return rows.length ? rows.reduce((a, r) => a + Math.min(cap, r.actual / r.predicted), 0) / rows.length : 1;
}

/** Substitution assumed for the low case: no department keeps more than this share of new volume. */
export const LOW_INCREMENTALITY = 0.7;

/**
 * Low and high around the expected lift. Low: the median adopter, and every department substituting
 * at least as much as drinks (incrementality capped at 70%). High: the mean adopter (heavy buyers
 * capped at twice the typical volume) with the measured incrementality.
 */
export function range(gross: { department: string; value: number }[], rows: BacktestRow[], inc: Incrementality): [number, number] {
  return [expected(gross, realizationOf(rows), inc, LOW_INCREMENTALITY), expected(gross, realizationHigh(rows), inc)];
}

export { TIERS };
