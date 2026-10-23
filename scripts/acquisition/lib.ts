// Month-over-month store acquisition by rep: pure logic for `pnpm acquisition`. Decisions in
// docs/exploration/acquisition.md.
//
// A store is acquired in the month of its first order. Prospects at the start of a month = today's
// prospect list + every store whose first order is in that month or later (it was a prospect until
// then, listed or not). A store is active at a month's end when it ordered in the 45 days before.

export const ACTIVE_DAYS = 45;

/** The first day of each of the `n` months ending with `asOf`'s month, oldest first (YYYY-MM-01). */
export function monthStarts(asOf: string, n: number): string[] {
  const [y, m] = asOf.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const k = y * 12 + (m - 1) - (n - 1 - i);
    return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}-01`;
  });
}

/** The last day of a month (YYYY-MM-DD), or `asOf` when that comes first. */
export function monthEnd(start: string, asOf: string): string {
  const [y, m] = start.split("-").map(Number) as [number, number];
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return end < asOf ? end : asOf;
}

/** Index of the month a date falls in, -1 before the first month, `starts.length` after the last. */
export function monthIndex(date: string, starts: string[]): number {
  const ym = date.slice(0, 7);
  if (ym < starts[0]!.slice(0, 7)) return -1;
  const i = starts.findIndex((s) => s.slice(0, 7) === ym);
  return i === -1 ? starts.length : i;
}

const dayNumber = (d: string) => Math.floor(Date.parse(d) / 86_400_000);

/** Whether a store with these order days (sorted) ordered in the ACTIVE_DAYS days up to `end`. */
export function activeAt(days: string[], end: string): boolean {
  const e = dayNumber(end);
  for (let i = days.length - 1; i >= 0; i--) {
    const d = dayNumber(days[i]!);
    if (d > e) continue;
    return e - d < ACTIVE_DAYS;
  }
  return false;
}
