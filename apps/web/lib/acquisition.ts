// The Acquisition tab: stores acquired by rep, month by month, with the acquisition rate and the
// penetration of each rep's market. Decisions in docs/exploration/acquisition.md.

export interface AcquisitionCell {
  rep: number;
  type: number;
  market: number;
  acquired: number[];
  prospectsStart: number[];
  activeEnd: number[];
}

export interface AcquisitionBase {
  schema_version: 1;
  as_of: string;
  /** First day of each month, oldest first. */
  months: string[];
  /** The last month runs only to `as_of`. */
  partial: boolean;
  reps: string[];
  types: string[];
  cells: AcquisitionCell[];
}

export type Measure = "stores" | "rate" | "penetration";

export interface RepSeries {
  name: string;
  market: number;
  acquired: number[];
  prospectsStart: number[];
  activeEnd: number[];
}

/** Per rep and in total, over the store types kept (all when `types` is empty). */
export function series(base: AcquisitionBase, types: number[]): { reps: RepSeries[]; total: RepSeries } {
  const n = base.months.length;
  const blank = (name: string): RepSeries => ({ name, market: 0, acquired: Array(n).fill(0), prospectsStart: Array(n).fill(0), activeEnd: Array(n).fill(0) });
  const reps = base.reps.map(blank);
  const total = blank("All reps");
  for (const c of base.cells) {
    if (types.length && !types.includes(c.type)) continue;
    for (const s of [reps[c.rep]!, total]) {
      s.market += c.market;
      for (let m = 0; m < n; m++) {
        s.acquired[m]! += c.acquired[m]!;
        s.prospectsStart[m]! += c.prospectsStart[m]!;
        s.activeEnd[m]! += c.activeEnd[m]!;
      }
    }
  }
  return { reps, total };
}

/** A month's value: stores acquired, acquired ÷ prospects at the month's start, or active at its end ÷ market. */
export function valueAt(s: RepSeries, m: number, measure: Measure): number {
  if (measure === "stores") return s.acquired[m]!;
  if (measure === "rate") return s.prospectsStart[m]! ? s.acquired[m]! / s.prospectsStart[m]! : 0;
  return s.market ? s.activeEnd[m]! / s.market : 0;
}

/** The whole window: stores acquired, acquired ÷ prospects at the start, or the last month's penetration. */
export function totalOf(s: RepSeries, measure: Measure): number {
  const n = s.acquired.length;
  const sum = s.acquired.reduce((a, b) => a + b, 0);
  if (measure === "stores") return sum;
  if (measure === "rate") return s.prospectsStart[0] ? sum / s.prospectsStart[0] : 0;
  return valueAt(s, n - 1, "penetration");
}
