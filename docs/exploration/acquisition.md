# Acquisition tab — stores acquired by rep, month over month

Started 2026-10-23 (Rick). A separate tab: for each rep, the stores acquired each month over the last year, as stores and as rates.

## Definitions (Rick, 2026-10-23)

| Term | Definition |
|---|---|
| Months | October 2025 to the current month, 13 in all; the current month runs to the as-of date and is drawn lighter |
| Acquired | A store's first order falls in the month |
| Rep | From the prospect list; a store takes the rep who owns its ZIP (as on the Market tab); otherwise Unassigned |
| Prospects at a month's start | Today's prospect list **plus every store acquired that month or later**: a store acquired in July 2026 counts as a prospect from October 2025 to June 2026, listed or not |
| Acquisition rate | Stores acquired in the month ÷ prospects at its start; over the window, all acquired ÷ prospects at the start of the first month |
| Penetration | Stores active at the month's end (ordered in the 45 days before) ÷ the rep's market |
| Market | Today's prospect list + every store that ordered in the last 24 months. It is fixed, so penetration moves only with active stores. (The Market tab leaves out stores whose last order is over a year old, so its market is slightly smaller.) |

Prospects whose name doesn't say the store type are spread over the types of the others, as on the Market tab, so the store-type filter works for them too.

## First run (2026-10-23)

1,765 stores acquired from October 2025 to 23 October 2026; August 2026 was the best full month (196). Penetration of the whole market went from 17.6% to 20.2%. Douglas Hernandez acquired the most stores (312); John Soto moved his penetration the most (+7.8 points, 25.6% → 33.4%) at the highest acquisition rate (31.6% of his prospects over the window). Jason Vickers' San Diego territory started acquiring in February 2026.

## Building it

```
pnpm athena:export market-stores market-store-days
pnpm acquisition   # dist/acquisition/acquisition.json (gitignored) and a printout by rep
pnpm web:html
```

- `market_store_days.sql`: the days each CA store ordered since 2025-08-01 (for active at each month's end). No amounts.
- `scripts/acquisition/` builds per rep × store type × month: acquired, prospects at the start, active at the end, and the market. `apps/web/lib/acquisition.ts` (tests beside it) and `apps/web/components/AcquisitionView.tsx` are the tab: a monthly column chart (all reps, or the rep clicked in the table) and a rep × month table shaded by value, for stores acquired, acquisition rate or penetration, filtered by store type.
