# Penetration lift — plan

Started 2026-10-21. Question (Rick): what is the yearly lift in Mercaso sales if more stores buy the catalog items they don't buy yet? This part covers **active stores only** (ordered in the last 45 days). A second part will target churned and prospect stores.

## Decisions (Rick, 2026-10-21)

| Question | Decision |
|---|---|
| Store types | Every buying store type a catalog fits, not only liquor stores and laundromats |
| Stores | Active only: ordered from Mercaso in the last 45 days (CA) |
| Scenarios | Catch up to peers (main), plus a flat +5 and +10 points |
| Priorities | All; nice shown separately |
| Substitution | Measured from stores that started buying an item in the past |
| Headline | Gross margin, with revenue beside it |

## Which catalog each store type is measured against

| Store type | Catalog |
|---|---|
| Liquor store | Liquor |
| Laundromat | Laundromat |
| Market / grocery, gas station, convenience store, smoke shop, discount dollar, no type set | Liquor (the closest shelf: drinks, snacks, tobacco, household, health & beauty) |
| Restaurant, miscellaneous, non-store, hotel | Not covered: the catalog is not built for what they buy |

Each store is compared with **stores of its own type** and order frequency (the store view's tiers: 1–5, 6–20, 21–50, 51+ orders a year), never with liquor stores. A liquor-catalog item that gas stations don't carry stays near 0% for gas stations and adds almost no lift. For markets and smoke shops the lift is understated: the liquor catalog has none of their deeper grocery or tobacco range.

## Method

Everything is per **active store × catalog item**. An item counts as bought if the store bought any of its approved SKUs (twins count once).

- **Gap:** the store has not bought the item in the last 90 days. Items on supply hold (Arizona) are left out.
- **Penetration:** the share of the peer group's active stores that bought the item in 90 days. Peer group = store type × order tier; a group with fewer than 20 active stores uses its whole store type.
- **Value of closing a gap:** the typical yearly volume of the item among the peer group's buyers (median units in 12 months; the store type when a tier has fewer than 3 buyers) × today's unit price, from the item's recommended SKU (the approved SKU most stores buy). Volume is counted in units, not cases, so a 24-pack and a 35-pack of the same can add up correctly. Margin uses the average cost without CRV, as on the site.
- **Scenarios** set a target penetration per item and peer group; the lift is (target − today) × group size conversions × value.
  - **Catch up to peers:** the target is the item's penetration among the group's best-assorted quarter of stores (top 25% by catalog score).
  - **Flat +5 / +10 points:** today's penetration plus 5 or 10 points, for items at least one store in the group buys.
  - A store's share of the lift is its chance of converting (the group's conversions over its gaps) × the value.

## Keeping it honest (the back-test)

**Realization (are the volumes right?).** From a query on 30 months of orders (`lift-adopters`), an **adopter** is a store that first bought an item 12–18 months ago, after ordering from Mercaso for at least 90 days, and had not bought it in the year before. Its units in the full year after adopting are set against the typical yearly volume the model uses. First built on 180 days doubled, which overstated lumpy items (one case doubled to two); the full year fixes that. Result (2026-10-21, 103,072 adopters): the median adopter bought **exactly the typical volume (1.00)**; the middle half bought 0.5× to 2×, and a quarter bought exactly the typical amount.

**Incrementality (how much is substitution?).** Measured across active stores: within each catalog category (50+ stores buying from it), how many more units a store buys per extra item it carries, holding its size equal (its units outside the category), over the category's average units per item. Result: drinks 0.68, soft drinks 0.71, laundry (laundromats) 0.21: about 30% of a new drink's volume comes out of the store's other drinks, and a laundromat adding a detergent mostly splits the same sales. Every other department measures above 1 (broader assortments go with more committed stores), so it is capped at 100%.

An adopter before/after check (category volume before and after a store adds an item) was tried first and dropped: adopting stores were already growing the category (+40% against +20% for the store overall), so it could not separate substitution from growth.

**Expected lift = gross × realization × incrementality.** Orders are too lumpy for a resampled range, so the low and high cases are stated assumptions:

- **Low:** the median adopter, and every department substituting at least as much as drinks (incrementality capped at 70%).
- **High:** the mean adopter, with heavy buyers capped at twice the typical volume (1.15×), and the measured incrementality.

Two limits stay in the summary: the lift is in **Mercaso** sales (a store may already buy the item elsewhere), and it is a full-year **run rate** once stores convert, not first-year revenue.

## Status (2026-10-21)

Built and run: `pnpm lift` (`scripts/lift/`, tests beside it). 3,458 active stores covered; not covered: restaurants 138, miscellaneous 94, non-store 22, hotels 6. The dollar results are in `dist/lift/summary.md` (gitignored), shared with Rick. Part 2 (churned and prospect stores) is below.

## Outputs (gitignored, `dist/lift/`)

- `summary.md`: yearly lift per scenario in margin and revenue, expected with the low–high range, by store type, department and priority.
- `items.csv`: per item and store type, penetration today and target, extra stores, revenue and margin. The rep and pricing push list.
- `stores.csv`: per active store, its expected lift and top gaps, for working the biggest accounts first. Store names without contact details.

`pnpm lift` (`scripts/lift/`, logic in `lib.ts` with tests). Prices, costs, revenue and store names stay out of git.

## Data

```
pnpm athena:export pricing lift-stores lift-store-skus lift-adopters
pnpm lift
```

- `lift-stores`: every CA store that ordered in 12 months, with its type, orders and last order date.
- `lift-store-skus`: store × catalog SKU over 12 months (both catalogs' approved SKUs).
- `lift-adopters`: the back-test adopters above, with their units in the year after adopting.

## Part 2: serving more of the market (2026-10-21)

Question (Rick): what do we gain if we serve 25%, 30% and 35% of our market? (20% was asked first, but today is already above it.) Yearly amounts once the stores are ordering, not a date range.

**Decisions (Rick, 2026-10-21):**

| Question | Decision |
|---|---|
| Active stores | The stores that ordered in the last 45 days (3,718 on 2026-10-21) |
| Market | Active + the sales prospect list (12,121 rows) + churned stores (1,557: ordered in the last 12 months, not in the last 45 days). 17,396 stores; today 21.4% |
| Targets | 25%, 30%, 35% |
| Win-backs | A churned store comes back with the business it had in its last year with us |
| New stores | Not the first-year spend of stores won 1–2 years ago (we carried fewer products then). A new store spends like today's active stores of its kind, spread over the order-frequency tiers (1–5, 6–20, 21–50, 51+ orders a year) in today's proportions |

**Method.** Stores to add = target × market − active, taken from prospects and churned stores in proportion to their numbers (11% win-backs). Prospects get a store type from their name (gas brands, liquor, laundromat, market, smoke shop, convenience); names that don't say are spread over the same mix. Spend: per store type and tier, the median (the "at least" figure) and the mean with the top 5% capped (the expected figure) of today's active stores; stores younger than a year are annualized (at least 90 days). Profit: each store type's gross margin on what its active stores buy from the catalogs, at today's prices and costs.

**Watch-outs.** Churned stores spent much less before leaving than today's active stores of the same kinds, so new stores could land below the expected figure. The prospect list has repeats (about 1,440 rows) and chains that may buy centrally. New stores start slower than settled ones, and some will stop again.

`pnpm athena:export growth-stores` (and `pricing`, `lift-stores`, `lift-store-skus` for margins), with the list saved as `data/raw/prospects.csv`, then `pnpm growth` → `dist/growth/summary.md` and `targets.csv` (gitignored).
