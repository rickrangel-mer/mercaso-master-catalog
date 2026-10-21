// Growth to a target penetration: the yearly sales and profit gained if Mercaso serves more of the
// stores in its market. Pure logic for `pnpm growth`; the decisions are in
// docs/exploration/penetration-lift.md (part 2).
//
// Market = active stores (ordered in the last 45 days) + prospects (the sales list) + churned stores
// (ordered in the last 12 months, not in the last 45 days). Penetration = active ÷ market.
// To reach a target, the extra stores come from prospects and churned stores in proportion to
// their numbers. A churned store comes back with the business it had in its last year. A new
// store is spread over the order-frequency tiers in the same proportions as today's active stores
// of its type, and spends what today's active stores in that tier spend.
import { median } from "../../apps/web/lib/score.ts";
import { tierOf, TIERS } from "../stores/lib.ts";

export const ACTIVE_DAYS = 45;
export const CHURN_DAYS = 365;
/** Spend of a store younger than this is annualized as if it had this many days. */
export const MIN_TENURE_DAYS = 90;
/** A store type needs this many active stores in a tier for its own figure; otherwise all types'. */
export const MIN_TIER_STORES = 5;

export interface GrowthStore {
  id: string;
  type: string;
  first_order_date: string;
  last_order_date: string;
  spend_12m: number;
  orders_12m: number;
  spend_before: number;
  orders_before: number;
}

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export type Status = "active" | "churned" | "lapsed";
export function statusOf(s: GrowthStore, asOf: string): Status {
  const since = days(s.last_order_date, asOf);
  return since <= ACTIVE_DAYS ? "active" : since <= CHURN_DAYS ? "churned" : "lapsed";
}

/** Scale to a year when the store has been ordering for less than a year (at least MIN_TENURE_DAYS). */
const annualize = (x: number, tenure: number) => (tenure >= 365 ? x : (x * 365) / Math.max(MIN_TENURE_DAYS, tenure));

/** An active store's yearly spend and orders today. */
export function activeYear(s: GrowthStore, asOf: string): { spend: number; orders: number } {
  const tenure = days(s.first_order_date, asOf) + 1;
  return { spend: annualize(s.spend_12m, tenure), orders: annualize(s.orders_12m, tenure) };
}

/** A churned store's yearly spend before it stopped: its last 365 days of orders, annualized. */
export function churnedYear(s: GrowthStore): number {
  return annualize(s.spend_before, days(s.first_order_date, s.last_order_date) + 1);
}

/** Mean with the top 5% capped at the 95th percentile, so a few giant accounts don't set the average. */
export function cappedMean(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const cap = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]!;
  return s.reduce((a, x) => a + Math.min(cap, x), 0) / s.length;
}

export interface Value {
  /** Median-based: the typical store. */
  low: number;
  /** Capped mean: the average store, giants capped. */
  expected: number;
}

export interface TypeProfile {
  type: string;
  stores: number;
  /** Share of the type's active stores per order tier (TIERS order). */
  tierShare: number[];
  /** Yearly spend per tier. */
  tierSpend: Value[];
  /** A new store of this type: tier spend weighted by tier share. */
  newStore: Value;
}

/** Tier mix and spend per store type, from today's active stores. */
export function typeProfiles(stores: GrowthStore[], asOf: string): Map<string, TypeProfile> {
  const active = stores.filter((s) => statusOf(s, asOf) === "active").map((s) => ({ type: s.type, ...activeYear(s, asOf) }));
  const tierSpend = (list: { spend: number }[]): Value => ({ low: median(list.map((x) => x.spend)), expected: cappedMean(list.map((x) => x.spend)) });
  const byTier = (list: typeof active) => TIERS.map((_, t) => list.filter((x) => tierOf(Math.round(x.orders)) === t));
  const all = byTier(active);
  const out = new Map<string, TypeProfile>();
  for (const type of [...new Set(active.map((x) => x.type))]) {
    const mine = active.filter((x) => x.type === type);
    const tiers = byTier(mine);
    const tierShare = tiers.map((l) => l.length / mine.length);
    const spend = tiers.map((l, t) => tierSpend(l.length >= MIN_TIER_STORES ? l : all[t]!));
    out.set(type, {
      type,
      stores: mine.length,
      tierShare,
      tierSpend: spend,
      newStore: {
        low: spend.reduce((a, v, t) => a + v.low * tierShare[t]!, 0),
        expected: spend.reduce((a, v, t) => a + v.expected * tierShare[t]!, 0),
      },
    });
  }
  return out;
}

/** Store type from a prospect's name; "" when the name doesn't say. Order matters: gas brands first. */
export function prospectType(name: string): string {
  const n = name.toLowerCase();
  if (/chevron|shell|\b76\b|arco|ampm|am\/pm|mobil|valero|exxon|texaco|circle k|\bgas\b|fuel|petro|sinclair|conoco|speedway|world oil|thrifty oil|united oil/.test(n)) return "Gas station";
  if (/7-?eleven|7 eleven/.test(n)) return "Convenience store";
  if (/liquor|wine|spirits|\bbeer\b/.test(n)) return "Liquor store";
  if (/laundr|\bwash\b|coin/.test(n)) return "Laundromat";
  if (/smoke|vape|tobacco|cigar|hookah/.test(n)) return "Smoke shop";
  if (/market|mercado|grocery|carniceria|foods|supermarket|\bmeat/.test(n)) return "Market / grocery";
  if (/\bmart\b|convenience|food ?mart|minimart|mini mart|quick|\bstop\b|express|\bdeli\b/.test(n)) return "Convenience store";
  if (/dollar|\b99\b/.test(n)) return "Discount dollar";
  return "";
}

export interface Target {
  target: number;
  /** Net active stores to add. */
  needed: number;
  winBacks: number;
  newStores: number;
  sales: Value;
  profit: Value;
  /** New stores per store type, and their sales. */
  byType: { type: string; stores: number; sales: Value; profit: Value }[];
  winBackSales: Value;
  winBackProfit: Value;
}

export interface GrowthInput {
  active: number;
  /** Prospects per store type ("" = unclear). */
  prospects: Map<string, number>;
  /** Yearly spend each churned store had before it stopped. */
  churned: number[];
  profiles: Map<string, TypeProfile>;
  /** Gross margin rate per store type, and overall for types without one. */
  margin: Map<string, number>;
  marginOverall: number;
}

export function plan(input: GrowthInput, targets: number[]): { market: number; today: number; targets: Target[] } {
  const prospects = [...input.prospects.values()].reduce((a, b) => a + b, 0);
  const churned = input.churned.length;
  const market = input.active + prospects + churned;
  const marginOf = (type: string) => input.margin.get(type) ?? input.marginOverall;
  // Unclear prospects take the mix of the classified ones.
  const known = [...input.prospects].filter(([t]) => t !== "");
  const knownTotal = known.reduce((a, [, n]) => a + n, 0);
  const mix = known.map(([type, n]) => ({ type, share: knownTotal ? n / knownTotal : 0 }));
  const fallback = [...input.profiles.values()].reduce((a, p) => (p.stores > a.stores ? p : a));
  const profileOf = (type: string) => input.profiles.get(type) ?? fallback;
  const winBack: Value = { low: median(input.churned), expected: cappedMean(input.churned) };
  const winBackMargin = input.marginOverall;

  return {
    market,
    today: market ? input.active / market : 0,
    targets: targets.map((target) => {
      const needed = Math.max(0, Math.ceil(target * market) - input.active);
      const winBacks = prospects + churned ? Math.round((needed * churned) / (prospects + churned)) : 0;
      const newStores = needed - winBacks;
      const byType = mix.map(({ type, share }) => {
        const n = newStores * share;
        const v = profileOf(type).newStore;
        const m = marginOf(type);
        return { type, stores: n, sales: { low: n * v.low, expected: n * v.expected }, profit: { low: n * v.low * m, expected: n * v.expected * m } };
      });
      const winBackSales = { low: winBacks * winBack.low, expected: winBacks * winBack.expected };
      const winBackProfit = { low: winBackSales.low * winBackMargin, expected: winBackSales.expected * winBackMargin };
      const sum = (f: (x: (typeof byType)[number]) => number) => byType.reduce((a, x) => a + f(x), 0);
      return {
        target,
        needed,
        winBacks,
        newStores,
        byType,
        winBackSales,
        winBackProfit,
        sales: { low: sum((x) => x.sales.low) + winBackSales.low, expected: sum((x) => x.sales.expected) + winBackSales.expected },
        profit: { low: sum((x) => x.profit.low) + winBackProfit.low, expected: sum((x) => x.profit.expected) + winBackProfit.expected },
      };
    }),
  };
}

/** Gross margin rate: Σ cases × (price − cost) ÷ Σ cases × price, over SKUs with both. */
export function marginRate(rows: { cases: number; price?: number; cost?: number }[]): number | undefined {
  let rev = 0;
  let gm = 0;
  for (const r of rows) {
    if (!(r.price && r.price > 0) || r.cost === undefined) continue;
    rev += r.cases * r.price;
    gm += r.cases * (r.price - r.cost);
  }
  return rev > 0 ? gm / rev : undefined;
}
