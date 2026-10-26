# Sharing the data for cross-checking

Added 2026-10-26 (Rick): a way to hand the site and the data behind it to someone who will cross-reference the numbers.

## Download CSV on the tabs

The **Wallet**, **Market** and **Acquisition** tabs each have a **Download CSV** button in their filter row. It exports the table behind the tab with the settings on screen (filters, sliders, targets):

- Wallet: one row per department and a total: dollars and SKU lines per order at each snapshot and what the new SKUs add, SKUs per store (then, today, best stores, 6 and 12 months), catalog penetration, catalog share of spend, and the yearly revenue and profit added.
- Market: the total and every zone, sub-area, store type and rep: market, active, stopped ordering, prospects, last year's new stores, the targets (new and won back, 6 and 12 months), penetration and dollars.
- Acquisition: one row per rep (and all reps) and month: acquired, prospects at the start, acquisition rate, active at the month's end, market and penetration.

The no-prices site leaves the dollar columns out. The tables come from `apps/web/lib/exportTables.ts` (tests beside it).

## The data pack

`pnpm datapack` (after `pnpm wallet`, `pnpm market` and `pnpm acquisition`) writes `dist/datapack/mercaso-data-pack-<date>.zip` (gitignored):

- `screens/`: the same three tables at the site's default settings, identical to what the buttons export when the site opens.
- `raw/`: the Athena exports they are built from (Wallet stores, departments and catalog SKUs; pricing; market stores, ZIP regions and order days) and the prospect list.
- `sql/`: the queries; `config/zones.yaml`: the zone grouping.
- `README.md`: what each file is, how each number is made, the data dates and how to reproduce it.

The pack holds sales, prices, costs, store names and the prospect list: share it internally only.
