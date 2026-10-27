// Customer flows month by month for the Forecast tab: pure logic for `pnpm forecast`. Decisions in
// docs/exploration/forecast.md (Rick, 2026-10-27).
//
// A customer is a store that ordered in the last 90 days. Each month:
//   new        first order ever
//   saved      ordered again after 45 to 89 days without an order (it was at risk)
//   churned    reached 90 days without an order (dated on that 90th day)
//   won back   ordered again after 90+ days (a churned store came back)
// so customers at a month's end = customers before + new + won back − churned, exactly.

export const AT_RISK_DAYS = 45;
export const CHURN_DAYS = 90;

export type EventKind = "new" | "saved" | "churned" | "won back";
export interface StoreEvent {
  kind: EventKind;
  date: string;
}

const DAY = 86_400_000;
const dayNo = (d: string) => Math.floor(Date.parse(d) / DAY);
const iso = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

/**
 * A store's events from its first order and its order days (sorted, unique). Order days before the
 * export starts are unknown: `firstOrder` before the first day means the store ordered at some point
 * before; pass that as a day (e.g. the day before the export starts) so gaps are measured from it.
 */
export function storeEvents(firstOrder: string, days: string[], asOf: string): StoreEvent[] {
  const out: StoreEvent[] = [{ kind: "new", date: firstOrder }];
  const end = dayNo(asOf);
  for (let i = 1; i < days.length; i++) {
    const gap = dayNo(days[i]!) - dayNo(days[i - 1]!);
    if (gap >= CHURN_DAYS) {
      out.push({ kind: "churned", date: iso(dayNo(days[i - 1]!) + CHURN_DAYS) });
      out.push({ kind: "won back", date: days[i]! });
    } else if (gap >= AT_RISK_DAYS) out.push({ kind: "saved", date: days[i]! });
  }
  const last = days[days.length - 1];
  if (last && end - dayNo(last) >= CHURN_DAYS) out.push({ kind: "churned", date: iso(dayNo(last) + CHURN_DAYS) });
  return out;
}

/** The last order day on or before `date` (days sorted), or undefined. */
export function lastOrderBy(days: string[], date: string): string | undefined {
  let lo = 0;
  let hi = days.length - 1;
  let found: string | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid]! <= date) {
      found = days[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** A customer at `date`: ordered in the CHURN_DAYS days up to it. */
export const isCustomer = (days: string[], date: string) => {
  const l = lastOrderBy(days, date);
  return l !== undefined && dayNo(date) - dayNo(l) < CHURN_DAYS;
};

/** Churned at `date` (the pool won-back stores come from): ordered before, but not in the last CHURN_DAYS days. */
export const isChurned = (days: string[], date: string) => {
  const l = lastOrderBy(days, date);
  return l !== undefined && dayNo(date) - dayNo(l) >= CHURN_DAYS;
};
