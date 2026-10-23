// The Market tab: share of the market's stores that buy from us, by zone, sub-area, store type and
// rep, and the yearly dollars more stores bring. One dimension "drives": its sliders set how many
// new stores and win-backs each of its groups gains in 6 and 12 months; the other three charts show
// where those stores land. Decisions in docs/exploration/market.md.
//
// Market = active + churned + prospects. A group's gains are spread over its cells in proportion to
// their prospects (new stores) and churned stores (win-backs). A new store spends what today's active
// stores of its type spend, in today's mix of ordering bands (average, or typical with the median);
// a won-back store returns with the yearly business it had before it stopped.

export type Dim = "zone" | "area" | "type" | "rep";
export const DIMS: Dim[] = ["zone", "area", "type", "rep"];

export interface MarketType {
  name: string;
  /** Yearly spend of a new store of this type: average (capped mean) and typical (median). */
  newStore: number;
  newStoreLow: number;
  margin: number;
}

/** [zone, area, type, rep, active, activeRevenue, activeProfit, newPace, churned, churnedRevenue, churnedProfit, prospects] */
export type MarketCellRow = [number, number, number, number, number, number, number, number, number, number, number, number];

export interface MarketBase {
  schema_version: 1;
  as_of: string;
  zones: string[];
  areas: string[];
  areaZone: number[];
  types: MarketType[];
  reps: string[];
  cells: MarketCellRow[];
  /** Set in the no-prices build: revenue and profit are zeroed. */
  no_money?: boolean;
}

export interface MarketSettings {
  driver: Dim;
  spend: "average" | "typical";
  /** Per group of the driving dimension, in stores; null = the default. */
  newShort: (number | null)[];
  newLong: (number | null)[];
  backShort: (number | null)[];
  backLong: (number | null)[];
}

export interface GroupResult {
  name: string;
  /** For a sub-area, its zone's index. */
  zone?: number;
  market: number;
  active: number;
  churned: number;
  prospects: number;
  /** Active stores whose first order was in the last 12 months. */
  newPace: number;
  newShort: number;
  newLong: number;
  backShort: number;
  backLong: number;
  today: number;
  short: number;
  long: number;
  revenue: number;
  profit: number;
  revenueShort: number;
  revenueLong: number;
  profitShort: number;
  profitLong: number;
}

export interface MarketResult {
  total: GroupResult;
  groups: Record<Dim, GroupResult[]>;
}

/** Defaults: new stores at the last 12 months' pace (half of it in 6 months); no win-backs. */
export function defaults(g: { newPace: number; prospects: number }) {
  return { newShort: Math.min(g.prospects, g.newPace / 2), newLong: Math.min(g.prospects, g.newPace), backShort: 0, backLong: 0 };
}

export const groupNames = (base: MarketBase, dim: Dim): string[] =>
  dim === "zone" ? base.zones : dim === "area" ? base.areas : dim === "type" ? base.types.map((t) => t.name) : base.reps;
const keyOf = (c: MarketCellRow, dim: Dim) => (dim === "zone" ? c[0] : dim === "area" ? c[1] : dim === "type" ? c[2] : c[3]);

const empty = (name: string): GroupResult => ({
  name,
  market: 0,
  active: 0,
  churned: 0,
  prospects: 0,
  newPace: 0,
  newShort: 0,
  newLong: 0,
  backShort: 0,
  backLong: 0,
  today: 0,
  short: 0,
  long: 0,
  revenue: 0,
  profit: 0,
  revenueShort: 0,
  revenueLong: 0,
  profitShort: 0,
  profitLong: 0,
});

const clampTo = (x: number, max: number) => Math.max(0, Math.min(max, x));

export function computeMarket(base: MarketBase, set: MarketSettings): MarketResult {
  // The driving dimension's groups: their totals and targets.
  const drive = groupNames(base, set.driver).map(empty);
  for (const c of base.cells) {
    const g = drive[keyOf(c, set.driver)]!;
    g.prospects += c[11];
    g.churned += c[8];
    g.newPace += c[7];
  }
  const targets = drive.map((g, i) => {
    const d = defaults(g);
    const newShort = clampTo(set.newShort[i] ?? d.newShort, g.prospects);
    const backShort = clampTo(set.backShort[i] ?? d.backShort, g.churned);
    return {
      newShort,
      newLong: Math.max(newShort, clampTo(set.newLong[i] ?? d.newLong, g.prospects)),
      backShort,
      backLong: Math.max(backShort, clampTo(set.backLong[i] ?? d.backLong, g.churned)),
    };
  });

  const groups = Object.fromEntries(DIMS.map((d) => [d, groupNames(base, d).map(empty)])) as Record<Dim, GroupResult[]>;
  groups.area.forEach((g, i) => (g.zone = base.areaZone[i]));
  const total = empty("All stores");
  for (const c of base.cells) {
    const [, , type, , active, activeRevenue, activeProfit, newPace, churned, churnedRevenue, churnedProfit, prospects] = c;
    const di = keyOf(c, set.driver);
    const dg = drive[di]!;
    const t = targets[di]!;
    // This cell's share of its driving group's gains.
    const pShare = dg.prospects ? prospects / dg.prospects : 0;
    const cShare = dg.churned ? churned / dg.churned : 0;
    const nS = t.newShort * pShare;
    const nL = t.newLong * pShare;
    const bS = t.backShort * cShare;
    const bL = t.backLong * cShare;
    const ty = base.types[type]!;
    const perNew = set.spend === "typical" ? ty.newStoreLow : ty.newStore;
    const perBack = churned ? churnedRevenue / churned : 0;
    const perBackProfit = churned ? churnedProfit / churned : 0;
    const add = (g: GroupResult) => {
      g.market += active + churned + prospects;
      g.active += active;
      g.churned += churned;
      g.prospects += prospects;
      g.newPace += newPace;
      g.newShort += nS;
      g.newLong += nL;
      g.backShort += bS;
      g.backLong += bL;
      g.revenue += activeRevenue;
      g.profit += activeProfit;
      g.revenueShort += nS * perNew + bS * perBack;
      g.revenueLong += nL * perNew + bL * perBack;
      g.profitShort += nS * perNew * ty.margin + bS * perBackProfit;
      g.profitLong += nL * perNew * ty.margin + bL * perBackProfit;
    };
    for (const d of DIMS) add(groups[d][keyOf(c, d)]!);
    add(total);
  }
  for (const g of [total, ...DIMS.flatMap((d) => groups[d])]) {
    g.today = g.market ? g.active / g.market : 0;
    g.short = g.market ? (g.active + g.newShort + g.backShort) / g.market : 0;
    g.long = g.market ? (g.active + g.newLong + g.backLong) / g.market : 0;
  }
  return { total, groups };
}
