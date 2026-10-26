# Wallet view — average order value and department penetration

Started 2026-10-22, from Rick's whiteboard ("Wallet" and "Share increase", left side). The market side of the board (zones, sub-zones, verticals, reps) is a later, second report.

A **Wallet** tab on the site: average order value (AOV) by department, 12 months ago vs today vs short term vs long term, with a slider per department that sets where its penetration gets to. Everything re-scores in the browser.

## Decisions (Rick, 2026-10-22)

| Question | Decision |
|---|---|
| Snapshots | 12 months ago = the 90 days ending 2025-10-22; today = the last 90 days; scored the same way |
| Horizons | Short term 6 months, long term 12 months |
| Kept from the lift work | Ordering segments (store type × order tier), active days for stores and items, the comparison with the best stores of the same segment |
| Output | Stacked bars of AOV by department in dollars; hero blocks for yearly revenue and profit |
| Sliders | Target penetration per department, short and long term; reaching 45% → 65% must be harder than 10% → 40% |
| Not now | The "550/NBB" levers (pricing, UOM, M-Rewards); the market side of the board |

## Definitions

- **Active store:** ordered in the last 45 days (input). **Item carried:** bought in the last 90 days (input).
- **Departments:** Beverage, Candy & snacks, Tobacco, Grocery, Cleaning & household, Health & beauty, and Other (spend only). Dollars come from all of a store's spend, by Mercaso department; penetration from the master catalog's items mapped to the same groups (soft drinks and drinks → Beverage; household, laundry and mixers & bar → Cleaning & household).
- **Penetration of a department:** the share of its catalog items a store carries, averaged over active stores in view. **Items that count** is an input: must items (the default; Beverage 28% today, 47% at the best stores), must & should, or all.
- **Best stores:** in each segment, the top quarter (input: 10, 25 or 50%) by catalog coverage (must, should and nice weighted 3:2:1). Their penetration is the benchmark.
- **AOV:** spend in the 90 days ÷ orders in the 90 days, per department, for active stores in view.
- **Catalog coverage** (Rick, 2026-10-22): penetration counts master-catalog items only, but stores buy more. Each department card shows the share of its spend on catalog SKUs (Beverage 71%, Cleaning & household 58%, Tobacco 52%, Candy & snacks 36%, Grocery 32%, Health & beauty 27%).
- **Breadth, catalog or not:** distinct SKUs a store buys in a department in 90 days, 12 months ago vs today vs the best stores (e.g. Beverage 90 → 95, best stores 173). It needs no catalog, so it is the check on departments the catalog covers thinly.

## How a slider becomes dollars

1. A department target is reached by closing the **same share of the gap** to the best stores in every segment, item by item. Past the best stores, items move on toward 100% (a "stretch").
2. Items go up in proportion to their own gap, so the items most similar stores already carry fill first. In a department that is already high, the items left are less popular, so each extra point adds fewer dollars.
3. Each new carrier of an item adds what the segment's stores already buying it spend on it in a year (typical units × today's price; profit at today's cost), as in the lift report.
4. Reality check (input, on by default): × realization (1.00) × the department's incrementality (drinks 68%, soft drinks 71%, laundry 21%, others 100%), from `docs/exploration/penetration-lift.md`.
5. Short- and long-term AOV = today's AOV (everything stores already buy, catalog or not) + the extra yearly revenue from new catalog items spread over today's yearly orders (orders held constant). The chart draws the new items' part lighter on top of each department. Yearly revenue = today's 90-day spend × 365/90 + the extra; profit uses each department's margin on catalog purchases.

Defaults: short term closes a third of each gap, long term two thirds. Double-clicking a slider resets it.

Sliders read in **items per store** by default (Rick, 2026-10-22): catalog items the average store buys = penetration × the department's catalog items in scope, and the slider moves one whole item per store at a time from today. A toggle switches to penetration %. The increment shows on the slider while it moves. Hovering a block of the chart shows the department at that snapshot: dollars per order, from new items, catalog items bought vs the best stores, SKUs bought catalog or not, and the catalog share of spend.

## Any SKU: targets not capped by the catalog (Rick, 2026-10-23)

The catalog view caps the room: with must items, Beverage has 76 items and the best stores buy 36 of them, so a slider fills fast. Yet the best stores buy 173 different Beverage SKUs against 95 for the average store. The **Any SKU** setting (the default) sets targets in distinct SKUs a store buys, catalog or not:

1. Each store closes the same share of its own gap to the best stores of its segment (their average SKU count in the department). Defaults: a third in 6 months, two thirds in 12; the slider goes up to twice the gap (a stretch past the best stores).
2. **An extra SKU is worth what an added catalog item is worth on average:** the catalog plan at two thirds of the gap with every item counting (must, should and nice), divided by the items it adds. That is the typical yearly spend of stores already buying those items, with the back-test factors when the reality check is on. Comparing stores' spend with their SKU counts was tried and dropped: it mostly measures store size (it gave about three times the dollars).
3. Catalog penetration stays at today's on this setting; the SKUs bought in the short- and long-term bars are today's plus the new ones.

Default view (all store types, reality check on), long term: average order value up 18%, about 2.5 times the gain from all catalog items and 5 times must items alone. Beverage: 95 → 151 SKUs a store, half of the gain. Dollar figures are on the site only (house rule: no revenue in git).

## SKUs per order (Rick, 2026-10-26)

The order chart switches between **$ per order** and **SKUs per order**: SKU lines per order (each SKU on an order counts once; `lines` in `wallet_store_dept.sql`), by department. In the short and long term, the new SKUs' extra dollars are turned into lines at each department's dollars per line today, so both views tell the same story. First run (all store types, default targets): 27.1 lines an order a year ago, 35.5 today, 42.5 in 12 months, Beverage +2.9 and Candy & snacks +2.3 of the 7 added.

## Later

- Widen the catalog where coverage is thin (candy, grocery, health & beauty): cross-check the best stores' top off-catalog SKUs against the catalog.

## Building it

```
pnpm athena:export pricing wallet-stores wallet-store-dept wallet-store-skus lift-adopters
pnpm wallet       # dist/wallet/wallet.json (gitignored) and a printout of the default view
pnpm web:html     # the Wallet tab is in both files; the no-prices file shows penetration only
```

- `wallet_stores.sql`: per covered store, last order and orders as of today and as of 365 days ago.
- `wallet_store_dept.sql`: spend, spend on catalog SKUs and distinct SKUs per store and Mercaso department, in both 90-day windows.
- `wallet_store_skus.sql`: per store and catalog SKU, the last purchase up to each anchor and 12-month cases.
- `scripts/wallet/run.ts` builds the base file; `apps/web/lib/wallet.ts` (tests beside it) is the logic the tab runs; `apps/web/components/WalletView.tsx` is the tab.

The base file is about 7 MB (each store's item history at both anchors), so the single-file site is about 8 MB.
