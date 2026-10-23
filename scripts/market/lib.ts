// The market report: which zone, sub-area and rep each store and prospect belongs to, and the
// cells (zone × sub-area × store type × rep) the site's sliders work on. Pure logic for
// `pnpm market`; the decisions are in docs/exploration/market.md.

/** A sub-area (map region) for a ZIP: its own, else the nearest mapped ZIP in the same ZIP3, else the ZIP3's named area. */
export function areaOfZip(zip: string, regions: Map<string, string>, zip3Regions: Record<string, string>): string {
  const z = zip.trim().slice(0, 5);
  if (!/^\d{5}$/.test(z)) return "";
  const own = regions.get(z);
  if (own) return own;
  const named = zip3Regions[z.slice(0, 3)];
  if (named) return named;
  const n = Number(z);
  let best = "";
  let gap = Infinity;
  for (const [other, region] of regions) {
    if (other.slice(0, 3) !== z.slice(0, 3)) continue;
    const d = Math.abs(Number(other) - n);
    if (d < gap) [best, gap] = [region, d];
  }
  return best;
}

/** The rep who owns a ZIP: the salesperson most of the ZIP's assigned prospects carry. */
export function repsByZip(rows: { zip: string; rep: string }[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const { zip, rep } of rows) {
    const z = zip.trim().slice(0, 5);
    if (!/^\d{5}$/.test(z) || !rep.trim()) continue;
    const c = counts.get(z) ?? new Map<string, number>();
    c.set(rep, (c.get(rep) ?? 0) + 1);
    counts.set(z, c);
  }
  const out = new Map<string, string>();
  for (const [z, c] of counts) out.set(z, [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0]);
  return out;
}

export interface MarketCell {
  zone: number;
  area: number;
  type: number;
  rep: number;
  /** Active stores (ordered in the last 45 days), their yearly sales and gross profit. */
  active: number;
  activeRevenue: number;
  activeProfit: number;
  /** Active stores that placed their first order in the last 12 months: the pace of winning new stores. */
  newPace: number;
  /** Churned stores (ordered in the last 12 months, not the last 45 days) and the yearly sales they had before they stopped. */
  churned: number;
  churnedRevenue: number;
  churnedProfit: number;
  prospects: number;
}

/** Index of a name in a list, appending it when new. */
export function indexer(list: string[]): (name: string) => number {
  const at = new Map(list.map((n, i) => [n, i]));
  return (name) => {
    let i = at.get(name);
    if (i === undefined) {
      i = list.length;
      list.push(name);
      at.set(name, i);
    }
    return i;
  };
}

/** Store types that say nothing: such a store is typed by its name, or spread. */
export const UNTYPED = new Set(["", "Unknown", "No type set"]);

/**
 * The store types a store counts under, with weights summing to 1: its own type; for an untyped
 * store, the type its name says (`fromName`); otherwise spread over `mix` (counts per type) in
 * proportion — the same fallback as for prospects.
 */
export function typeWeights(type: string, name: string, fromName: (name: string) => string, mix: Map<string, number>): [string, number][] {
  if (!UNTYPED.has(type.trim())) return [[type.trim(), 1]];
  const guessed = fromName(name);
  if (guessed) return [[guessed, 1]];
  const total = [...mix.values()].reduce((a, b) => a + b, 0);
  return total ? [...mix].map(([t, n]): [string, number] => [t, n / total]) : [["", 1]];
}
