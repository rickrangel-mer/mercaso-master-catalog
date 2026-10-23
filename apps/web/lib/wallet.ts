// Wallet view: average order value by department and department penetration, 12 months ago vs
// today vs short term (6 months) vs long term (12 months), driven by penetration targets per
// department. Pure: shared by `pnpm wallet` (tests, defaults) and the site's Wallet tab, which
// re-runs it whenever an input changes. Method: docs/exploration/wallet.md.
//
// Penetration of a department = the share of its catalog items a store carries (bought in the item
// window), averaged over active stores. A target penetration is reached by closing the same share
// of the gap to the best stores in every segment (store type × order tier), item by item; beyond
// the best stores, items move on toward 100%. Each new carrier of an item adds that segment's
// typical yearly spend on it.

export type WalletPriority = "must" | "should" | "nice";
export const PRIORITY_WEIGHT: Record<WalletPriority, number> = { must: 3, should: 2, nice: 1 };

export interface WalletItem {
  /** Catalog item name, e.g. "Cola › Coca-Cola › Classic › 12oz can". */
  name: string;
  /** Index into `groups`. */
  group: number;
  priority: WalletPriority;
  /** Share of a new carrier's volume that is new to Mercaso (substitution taken out), 0–1. */
  incrementality: number;
}

export interface WalletSegment {
  key: string;
  type: string;
  /** Order tier index, or -1 for a pooled small store type. */
  tier: number;
  catalog: string;
  /** Per catalog item: a new carrier's yearly revenue and gross profit (typical volume × today's price). */
  revenue: number[];
  profit: number[];
}

export interface WalletStore {
  type: string;
  /** Segment index for today's projection. */
  segment: number;
  /** Order tier today and 12 months ago (by orders in the year before each anchor). */
  tierNow: number;
  tierThen: number;
  catalog: string;
  /** Days since the last order, as of today and as of 12 months ago (-1: no order by then). */
  lastNow: number;
  lastThen: number;
  /** Orders in the 90 days up to each anchor. */
  ordersNow: number;
  ordersThen: number;
  /** Spend per group in the 90 days up to each anchor. */
  spendNow: number[];
  spendThen: number[];
  /** Of that, spend on the master catalog's SKUs, per group. */
  catSpendNow: number[];
  catSpendThen: number[];
  /** Distinct SKUs bought per group in each 90-day window, catalog or not. */
  skusNow: number[];
  skusThen: number[];
  /** Catalog items bought in the 180 days up to each anchor, flat: item index, days since bought, … */
  itemsNow: number[];
  itemsThen: number[];
}

export interface WalletBase {
  schema_version: 1;
  as_of: string;
  then_as_of: string;
  /** Display groups (departments), in stack order. The last is "Other": spend only, no catalog items. */
  groups: string[];
  catalogs: Record<string, WalletItem[]>;
  segments: WalletSegment[];
  stores: WalletStore[];
  tiers: string[];
  /** Gross margin rate per group, for today's spend. */
  margins: number[];
  /** Back-test: new carriers' first year against the typical volume (1 = as assumed). */
  realization: number;
  /** Set in the no-prices build: spend, revenue, profit and margins are zeroed. */
  no_money?: boolean;
}

export interface WalletSettings {
  activeDays: number;
  itemDays: number;
  /** Share of a segment's stores that make up "the best stores" (by catalog coverage). */
  topShare: number;
  /** Store types and tiers in view; empty = all. */
  types: string[];
  tiers: number[];
  /** Apply the back-test (realization and incrementality). */
  reality: boolean;
  /** Catalog priorities that count toward penetration and the targets. */
  priorities: WalletPriority[];
  /** Target penetration per group (0–1), short and long term; null = the default. */
  shortTerm: (number | null)[];
  longTerm: (number | null)[];
  /**
   * What the targets move: "catalog" = penetration of the catalog's items (the default here);
   * "skus" = distinct SKUs a store buys, catalog or not, so the room is not capped by the catalog.
   */
  basis?: "catalog" | "skus";
  /** Target distinct SKUs per store per group (average), short and long term; null = the default. */
  shortSkus?: (number | null)[];
  longSkus?: (number | null)[];
}

export const DEFAULT_SETTINGS: Omit<WalletSettings, "shortTerm" | "longTerm"> = {
  activeDays: 45,
  itemDays: 90,
  topShare: 0.25,
  types: [],
  tiers: [],
  reality: true,
  priorities: ["must", "should"],
};
/** Default targets close this share of the gap to the best stores. */
export const DEFAULT_GAP = { shortTerm: 1 / 3, longTerm: 2 / 3 };
/** Gap position 1 = the best stores; 2 = every item at 100%. */
export const MAX_GAP = 2;

export interface Snapshot {
  stores: number;
  orders: number;
  /** AOV per group ($ per order): everything the stores buy from us, catalog or not. */
  aov: number[];
  /** The part of `aov` that comes from new catalog items (projections only; 0 for actuals). */
  aovAdded: number[];
  /** Share of each group's spend on catalog SKUs (NaN without spend). */
  coverage: number[];
  /** Distinct SKUs bought per store per group in 90 days, catalog or not (projections add the new ones). */
  skus: number[];
  /** Penetration per group (0–1); NaN where no store in view has items in the group. */
  penetration: number[];
  /** Yearly revenue and gross profit at this snapshot's pace. */
  revenue: number;
  profit: number;
}

export interface GroupPlan {
  /** Penetration 12 months ago, today, at the best stores, and the targets. */
  then: number;
  today: number;
  best: number;
  shortTerm: number;
  longTerm: number;
  /** Gap position of each target (0 = today, 1 = best stores, 2 = 100%). */
  shortGap: number;
  longGap: number;
  /** Extra yearly revenue and profit per target. */
  shortRevenue: number;
  shortProfit: number;
  longRevenue: number;
  longProfit: number;
  /** Extra yearly revenue for one more point of penetration from today's level. */
  revenuePerPoint: number;
  /** Catalog items in the group that count (the chosen priorities), averaged over stores in view. */
  itemsPerStore: number;
  /** Breadth without the catalog: distinct SKUs a store buys in 90 days, 12 months ago, today, best stores. */
  skusThen: number;
  skusToday: number;
  skusBest: number;
  /** Share of the group's spend today on catalog SKUs. */
  coverage: number;
  /** "skus" basis: target SKUs per store and their gap positions (0 = today, 1 = best stores). */
  skusShort: number;
  skusLong: number;
  skusShortGap: number;
  skusLongGap: number;
  /** "skus" basis: the highest target the slider allows (gap position MAX_GAP). */
  skusMax: number;
  /** Extra yearly revenue for one more SKU per store, on average (across the stores in view). */
  revenuePerSku: number;
}

export interface WalletResult {
  then: Snapshot;
  today: Snapshot;
  shortTerm: Snapshot;
  longTerm: Snapshot;
  groups: GroupPlan[];
}

const inView = (s: { type: string }, tier: number, set: WalletSettings) =>
  (set.types.length === 0 || set.types.includes(s.type)) && (set.tiers.length === 0 || set.tiers.includes(tier));

/** Item target adoption for a gap position: today → best stores (1) → 100% (2). */
export function itemTarget(a: number, top: number, gap: number): number {
  const best = Math.max(a, top);
  if (gap <= 1) return a + gap * (best - a);
  return best + Math.min(1, gap - 1) * (1 - best);
}

function snapshot(base: WalletBase, set: WalletSettings, when: "now" | "then"): Snapshot & { carried: Map<number, Set<number>> } {
  const G = base.groups.length;
  const spend = new Array<number>(G).fill(0);
  const catSpend = new Array<number>(G).fill(0);
  const skus = new Array<number>(G).fill(0);
  const penSum = new Array<number>(G).fill(0);
  const penN = new Array<number>(G).fill(0);
  const carried = new Map<number, Set<number>>();
  let stores = 0;
  let orders = 0;
  let profit = 0;
  base.stores.forEach((s, k) => {
    const last = when === "now" ? s.lastNow : s.lastThen;
    const tier = when === "now" ? s.tierNow : s.tierThen;
    if (last < 0 || last > set.activeDays || !inView(s, tier, set)) return;
    stores++;
    orders += when === "now" ? s.ordersNow : s.ordersThen;
    const sp = when === "now" ? s.spendNow : s.spendThen;
    sp.forEach((x, g) => {
      spend[g]! += x;
      profit += x * (base.margins[g] ?? 0);
    });
    (when === "now" ? s.catSpendNow : s.catSpendThen).forEach((x, g) => (catSpend[g]! += x));
    (when === "now" ? s.skusNow : s.skusThen).forEach((x, g) => (skus[g]! += x));
    const items = base.catalogs[s.catalog]!;
    const flat = when === "now" ? s.itemsNow : s.itemsThen;
    const bought = new Set<number>();
    for (let j = 0; j < flat.length; j += 2) if (flat[j + 1]! <= set.itemDays) bought.add(flat[j]!);
    carried.set(k, bought);
    const have = new Array<number>(G).fill(0);
    const size = groupSizes(base, s.catalog, set.priorities);
    for (const i of bought) if (set.priorities.includes(items[i]!.priority)) have[items[i]!.group]!++;
    for (let g = 0; g < G; g++) {
      if (!size[g]) continue;
      penSum[g]! += have[g]! / size[g]!;
      penN[g]!++;
    }
  });
  const year = 365 / 90;
  return {
    stores,
    orders,
    aov: spend.map((x) => (orders ? x / orders : 0)),
    aovAdded: spend.map(() => 0),
    coverage: spend.map((x, g) => (x > 0 ? catSpend[g]! / x : NaN)),
    skus: skus.map((x) => (stores ? x / stores : 0)),
    penetration: penSum.map((x, g) => (penN[g] ? x / penN[g]! : NaN)),
    revenue: spend.reduce((a, b) => a + b, 0) * year,
    profit: profit * year,
    carried,
  };
}

const groupCache = new WeakMap<WalletItem[], Map<string, number[][]>>();
/** Item indexes per group for a catalog, counting only the given priorities. */
function groupItems(base: WalletBase, catalog: string, priorities: WalletPriority[]): number[][] {
  const items = base.catalogs[catalog]!;
  let byKey = groupCache.get(items);
  if (!byKey) groupCache.set(items, (byKey = new Map()));
  const key = [...priorities].sort().join(",");
  let byGroup = byKey.get(key);
  if (!byGroup) {
    const groups: number[][] = base.groups.map(() => []);
    items.forEach((it, i) => {
      if (priorities.includes(it.priority)) groups[it.group]!.push(i);
    });
    byKey.set(key, (byGroup = groups));
  }
  return byGroup;
}
const groupSizes = (base: WalletBase, catalog: string, priorities: WalletPriority[]) => groupItems(base, catalog, priorities).map((l) => l.length);

interface SegmentState {
  segment: WalletSegment;
  n: number;
  /** Per item: adoption today and among the best stores. */
  a: number[];
  top: number[];
  /** The best stores, and all stores in view (store indexes). */
  best: number[];
  members: number[];
}

/** Per segment in view: today's adoption of each item and the best stores' adoption. */
function segmentStates(base: WalletBase, set: WalletSettings, carried: Map<number, Set<number>>): SegmentState[] {
  const members = new Map<number, number[]>();
  for (const k of carried.keys()) {
    const seg = base.stores[k]!.segment;
    const list = members.get(seg) ?? [];
    list.push(k);
    members.set(seg, list);
  }
  const out: SegmentState[] = [];
  for (const [si, ks] of members) {
    const segment = base.segments[si]!;
    const items = base.catalogs[segment.catalog]!;
    const totals = { must: 0, should: 0, nice: 0 };
    for (const it of items) totals[it.priority]++;
    const score = (k: number) => {
      const n = { must: 0, should: 0, nice: 0 };
      for (const i of carried.get(k)!) n[items[i]!.priority]++;
      return (["must", "should", "nice"] as const).reduce((acc, p) => acc + PRIORITY_WEIGHT[p] * (totals[p] ? n[p] / totals[p] : 0), 0);
    };
    const scores = new Map(ks.map((k) => [k, score(k)]));
    const ranked = [...ks].sort((x, y) => scores.get(y)! - scores.get(x)!);
    const top = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * set.topShare)));
    const count = (list: number[]) => {
      const c = new Array<number>(items.length).fill(0);
      for (const k of list) for (const i of carried.get(k)!) c[i]!++;
      return c.map((x) => x / list.length);
    };
    out.push({ segment, n: ks.length, a: count(ks), top: count(top), best: top, members: ks });
  }
  return out;
}

/** Penetration of a group at a gap position, over the segments in view. */
function penetrationAt(base: WalletBase, states: SegmentState[], g: number, gap: number, priorities: WalletPriority[]): number {
  let sum = 0;
  let n = 0;
  for (const st of states) {
    const idx = groupItems(base, st.segment.catalog, priorities)[g]!;
    if (!idx.length) continue;
    let t = 0;
    for (const i of idx) t += itemTarget(st.a[i]!, st.top[i]!, gap);
    sum += (t / idx.length) * st.n;
    n += st.n;
  }
  return n ? sum / n : NaN;
}

/** Extra yearly revenue and profit in a group at a gap position. */
function gainAt(base: WalletBase, states: SegmentState[], g: number, gap: number, set: WalletSettings): { revenue: number; profit: number } {
  let revenue = 0;
  let profit = 0;
  for (const st of states) {
    const items = base.catalogs[st.segment.catalog]!;
    for (const i of groupItems(base, st.segment.catalog, set.priorities)[g]!) {
      const extra = (itemTarget(st.a[i]!, st.top[i]!, gap) - st.a[i]!) * st.n;
      if (extra <= 0) continue;
      const f = set.reality ? base.realization * items[i]!.incrementality : 1;
      revenue += extra * st.segment.revenue[i]! * f;
      profit += extra * st.segment.profit[i]! * f;
    }
  }
  return { revenue, profit };
}

const ALL_PRIORITIES: WalletPriority[] = ["must", "should", "nice"];

/**
 * The "skus" basis for a group. Each store closes the same share of its gap to the best stores'
 * SKU count in its segment (catalog or not). An extra SKU is worth what an added catalog item is
 * worth on average: the catalog plan at the long-term default with every item counting, divided by
 * the items it adds (typical spend of stores already buying them, × the back-test factors with the
 * reality check on). Comparing stores' spend with their SKU counts would mostly measure store size.
 */
function skuPlan(base: WalletBase, states: SegmentState[], g: number, set: WalletSettings) {
  const all = { ...set, priorities: ALL_PRIORITIES };
  const cat = gainAt(base, states, g, DEFAULT_GAP.longTerm, all);
  let added = 0;
  let stores = 0;
  let addPerGap = 0; // extra SKUs summed over stores at gap position 1
  for (const st of states) {
    for (const i of groupItems(base, st.segment.catalog, ALL_PRIORITIES)[g]!) added += (itemTarget(st.a[i]!, st.top[i]!, DEFAULT_GAP.longTerm) - st.a[i]!) * st.n;
    const best = st.best.reduce((a, k) => a + base.stores[k]!.skusNow[g]!, 0) / st.best.length;
    for (const k of st.members) addPerGap += Math.max(0, best - base.stores[k]!.skusNow[g]!);
    stores += st.n;
  }
  // Per extra SKU per store, a year.
  const revenue = added > 0 ? cat.revenue / added : 0;
  const profit = added > 0 ? cat.profit / added : 0;
  return {
    perStore: stores ? addPerGap / stores : 0,
    gain: (gap: number) => ({ revenue: gap * addPerGap * revenue, profit: gap * addPerGap * profit }),
    revenuePerSku: revenue * stores,
  };
}

/** The gap position that reaches a target penetration (bisection; penetration rises with the gap). */
export function gapFor(target: number, at: (gap: number) => number): number {
  if (!(target > at(0))) return 0;
  if (target >= at(MAX_GAP)) return MAX_GAP;
  let lo = 0;
  let hi = MAX_GAP;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function computeWallet(base: WalletBase, set: WalletSettings): WalletResult {
  const G = base.groups.length;
  const thenSnap = snapshot(base, set, "then");
  const nowSnap = snapshot(base, set, "now");
  const states = segmentStates(base, set, nowSnap.carried);
  const year = 365 / 90;

  /** The best stores' distinct SKUs per group, each segment weighted by its stores. */
  const bestSkus = (g: number) => {
    let sum = 0;
    let n = 0;
    for (const st of states) {
      const avg = st.best.reduce((a, k) => a + base.stores[k]!.skusNow[g]!, 0) / st.best.length;
      sum += avg * st.n;
      n += st.n;
    }
    return n ? sum / n : 0;
  };
  const bySkus = set.basis === "skus";
  const groups: GroupPlan[] = [];
  const extra = { short: { rev: new Array<number>(G).fill(0), prof: 0 }, long: { rev: new Array<number>(G).fill(0), prof: 0 } };
  for (let g = 0; g < G; g++) {
    const at = (gap: number) => penetrationAt(base, states, g, gap, set.priorities);
    const today = at(0);
    if (Number.isNaN(today)) {
      const k = nowSnap.skus[g]!;
      groups.push({ then: thenSnap.penetration[g]!, today, best: NaN, shortTerm: NaN, longTerm: NaN, shortGap: 0, longGap: 0, shortRevenue: 0, shortProfit: 0, longRevenue: 0, longProfit: 0, revenuePerPoint: 0, itemsPerStore: 0, skusThen: thenSnap.skus[g]!, skusToday: k, skusBest: bestSkus(g), coverage: nowSnap.coverage[g]!, skusShort: k, skusLong: k, skusShortGap: 0, skusLongGap: 0, skusMax: k, revenuePerSku: 0 });
      continue;
    }
    // The "skus" basis: SKUs per store at a gap position, and the gap for a target.
    const sp = skuPlan(base, states, g, set);
    const skusToday = nowSnap.skus[g]!;
    const skuGap = (target: number | null | undefined, dflt: number) =>
      target == null ? dflt : sp.perStore > 0 ? Math.min(MAX_GAP, Math.max(0, (target - skusToday) / sp.perStore)) : 0;
    const skusShortGap = skuGap(set.shortSkus?.[g], DEFAULT_GAP.shortTerm);
    const skusLongGap = skuGap(set.longSkus?.[g], DEFAULT_GAP.longTerm);
    const skuGain = sp.gain;
    const shortTarget = set.shortTerm[g] ?? at(DEFAULT_GAP.shortTerm);
    const longTarget = set.longTerm[g] ?? at(DEFAULT_GAP.longTerm);
    const shortGap = gapFor(shortTarget, at);
    const longGap = gapFor(longTarget, at);
    const s = bySkus ? skuGain(skusShortGap) : gainAt(base, states, g, shortGap, set);
    const l = bySkus ? skuGain(skusLongGap) : gainAt(base, states, g, longGap, set);
    const plusOne = gainAt(base, states, g, gapFor(Math.min(1, today + 0.01), at), set).revenue;
    let sizeSum = 0;
    let n = 0;
    for (const st of states) {
      const size = groupSizes(base, st.segment.catalog, set.priorities)[g]!;
      sizeSum += size * st.n;
      n += st.n;
    }
    extra.short.rev[g] = s.revenue;
    extra.short.prof += s.profit;
    extra.long.rev[g] = l.revenue;
    extra.long.prof += l.profit;
    groups.push({
      then: thenSnap.penetration[g]!,
      today,
      best: at(1),
      shortTerm: at(shortGap),
      longTerm: at(longGap),
      shortGap,
      longGap,
      shortRevenue: s.revenue,
      shortProfit: s.profit,
      longRevenue: l.revenue,
      longProfit: l.profit,
      revenuePerPoint: plusOne,
      itemsPerStore: n ? sizeSum / n : 0,
      skusThen: thenSnap.skus[g]!,
      skusToday: nowSnap.skus[g]!,
      skusBest: bestSkus(g),
      coverage: nowSnap.coverage[g]!,
      skusShort: skusToday + skusShortGap * sp.perStore,
      skusLong: skusToday + skusLongGap * sp.perStore,
      skusShortGap,
      skusLongGap,
      skusMax: skusToday + MAX_GAP * sp.perStore,
      revenuePerSku: sp.revenuePerSku,
    });
  }

  const project = (rev: number[], prof: number, gaps: number[], term: "short" | "long"): Snapshot => {
    const ordersYear = nowSnap.orders * year;
    const pen = gaps.map((gap, g) => (Number.isNaN(nowSnap.penetration[g]!) ? NaN : penetrationAt(base, states, g, bySkus ? 0 : gap, set.priorities)));
    // SKUs bought: today's plus the new ones (catalog items added, or the SKU target).
    const skus = groups.map((gp, g) =>
      bySkus ? (term === "short" ? gp.skusShort : gp.skusLong) : nowSnap.skus[g]! + (Number.isNaN(pen[g]!) ? 0 : Math.max(0, pen[g]! - gp.today) * gp.itemsPerStore),
    );
    return {
      stores: nowSnap.stores,
      orders: nowSnap.orders,
      aov: nowSnap.aov.map((x, g) => x + (ordersYear ? rev[g]! / ordersYear : 0)),
      aovAdded: rev.map((r) => (ordersYear ? r / ordersYear : 0)),
      coverage: nowSnap.coverage,
      skus,
      penetration: pen,
      revenue: nowSnap.revenue + rev.reduce((a, b) => a + b, 0),
      profit: nowSnap.profit + prof,
    };
  };
  const strip = ({ carried: _c, ...rest }: Snapshot & { carried: unknown }): Snapshot => rest;
  return {
    then: strip(thenSnap),
    today: strip(nowSnap),
    shortTerm: project(extra.short.rev, extra.short.prof, groups.map((x) => x.shortGap), "short"),
    longTerm: project(extra.long.rev, extra.long.prof, groups.map((x) => x.longGap), "long"),
    groups,
  };
}
