# Market tab — how much of the market buys from us, and what more stores are worth

Started 2026-10-23 (Rick): the market side of the whiteboard. Same idea as the Wallet tab (sliders that change everything, yearly dollars), but for stores instead of items.

## Decisions (Rick, 2026-10-23)

| Question | Decision |
|---|---|
| What penetration | Market penetration: the share of the market's stores that order from us |
| Market | Active stores (ordered in the last 45 days) + stores that stopped ordering in the last 12 months + the prospect list (as in the growth summary) |
| Charts | Four bar charts: by zone (8 main zones), by store type, by sub-area (grouped by zone), by rep |
| Zones | Mercaso's map regions (store segmentation table) grouped into 8 zones, because reps can share a zone. Grouping in `data/market/zones.yaml`, editable |
| Reps | From the prospect list; a customer takes the rep who owns its ZIP (the rep most of the ZIP's prospects carry) |
| Combining sliders | One chart drives: its sliders set the targets, the other three show where those stores land, so totals always add up |
| Win-backs | Their own slider, next to new stores, per group |
| Unassigned | Prospects with no ZIP or rep, and customers outside every rep's ZIPs, are an Unassigned zone, sub-area and rep with their own sliders |

## How a slider becomes dollars

1. Each group of the driving dimension has two sliders per horizon (6 and 12 months): **new stores** (up to its prospects) and **won back** (up to its stores that stopped ordering). Defaults: new stores at last year's pace (active stores whose first order was in the last 12 months; half of it in 6 months), no win-backs. The 12-month value never drops below the 6-month one.
2. A group's new stores are spread over its stores in proportion to prospects (by sub-area, store type and rep), its win-backs in proportion to stopped stores. That is how the other three charts move.
3. **A new store** spends what today's active stores of its type spend, in today's mix of ordering bands: the average (capped mean) or, by the input, the typical (median) store. **A won-back store** returns with the yearly business it had before it stopped, giants capped at the 95th percentile. Gross profit uses each type's margin on catalog purchases. Figures are yearly run-rates, once the stores are ordering.
4. Penetration = (active + new + won back) ÷ market, for every group and in total.

## Placing stores

- A store or prospect takes the map region of its ZIP; a ZIP with no segmented store takes the nearest mapped ZIP's region in the same 3-digit area; San Diego (919–921) and Kern (932–933) have no mapped region and are named by area. 4,843 prospects (from the CRM) have no ZIP, city or rep and are Unassigned.
- Prospects whose name doesn't say the store type are spread over the types of the others, in their proportions.

## First run (2026-10-23, default targets)

- Market 17,405 stores: 3,742 active, 1,542 stopped ordering, 12,121 prospects. **21.5% today.**
- At last year's pace of new stores: **27.5% in 12 months**, +1,038 stores; Inland Empire adds the most sales. Dollar figures are on the site only (house rule: no revenue in git).
- Zones today: Central & West LA 39%, Southeast LA 37%, San Gabriel Valley 37%, Inland Empire 37%, South LA & Harbor 35%, Orange County 33%, Valleys & North 29%, San Diego 2.5% (45 of 1,765), Unassigned 0.3%.

## Building it

```
pnpm athena:export market-stores market-zips   # plus pricing and lift-store-skus for margins
pnpm market      # dist/market/market.json (gitignored) and a printout by zone
pnpm web:html    # the Market tab; the no-prices file keeps stores and penetration only
```

- `market_stores.sql`: every CA store that ordered in the last 24 months with its ZIP, spend and dates (as `growth_stores.sql`, plus the ZIP).
- `market_zips.sql`: each ZIP's map region.
- `scripts/market/` builds the cells (zone × sub-area × store type × rep); `apps/web/lib/market.ts` (tests beside it) is the logic the tab runs; `apps/web/components/MarketView.tsx` is the tab.
