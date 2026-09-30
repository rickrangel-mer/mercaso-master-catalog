# Store penetration — how much of the catalog each liquor store buys from Mercaso

The catalog so far answers "what should a liquor store carry, and which Mercaso SKU fills each slot". This section turns it around: **for each store, how much of that catalog does it buy from Mercaso today, what is it missing, and is it fading?**

Agreed with Rick on 2026-09-30.

## What it is for

1. **Pricing:** find the voids worth covering with a personalized pricing program. Which missing items are common among a store's peers, and what margin do they carry?
2. **Sales reps:** a per-store list of must and should items the store doesn't buy from us but stores like it do.
3. **Health monitoring:** stores that stopped ordering, and items a store bought during the year but not lately.

## Definitions

| Term | Definition |
|---|---|
| Stores | CA liquor stores (same store-type rule as the item work) that placed at least one order in the last 12 months. |
| Status | **Active** if the last order was within 45 days, otherwise **Inactive**. |
| Order tier | Orders in 12 months: 1–5, 6–20, 21–50, 51+. Order frequency is the peer group for now. |
| Trend | Orders in the last 90 days against the 90 days before: up (+20% or more), down (−20% or more), flat, new (none before), none. |
| Catalog items | Carried leaves with at least one approved Mercaso SKU (897 today: 195 must, 370 should, 332 nice). |
| Bought | The store bought any approved SKU of the item in 12 months. Coverage is bought items ÷ catalog items, per priority. |
| Catalog score | Must, should and nice coverage weighted 3:2:1, from 0 to 100. |
| vs. peers | Must coverage minus the median must coverage of the store's tier, in points. |
| Void | A catalog item the store has not bought in the last 90 days: either **not bought in 12 months** or **fading** (bought in 12 months, not in 90 days). |
| Peer adoption | Share of the store's tier that bought the item in 12 months. Voids are ranked by it. |
| Recommended SKU | The item's approved SKU bought by the most liquor stores. |
| Typical peer volume | Median cases a year of the item among the tier's stores that buy it. |
| Expected opportunity | For must and should voids: peer adoption × typical peer volume × today's price (promo price when on promo, no CRV), each SKU counted once. This is an estimate of what the store would buy if it behaved like its tier, not a forecast. |

All brands count, including those many stores buy directly from the distributor (Coca-Cola, Pepsi, Frito-Lay, tobacco). A store buying Coke from the bottler shows as a Coke void here; that's still a pricing and sales opportunity.

## The two tables

**Stores**, one row per store: store, number, organization, city, ZIP; status, days since last order, tier, orders in 12 months and 90 days, trend, spend; catalog score, must / should / nice coverage, vs. peers, coverage per department; must and should voids, fading items, top 3 must voids, expected opportunity.

**Voids**, one row per store and missing item: store, status, tier; item, department, priority; void type and days since bought; recommended SKU and case pack; peer adoption; typical peer volume; price, promo and margin; expected revenue. Grouped by store it is the rep's list. Grouped by item it is the pricing view. Filtered to fading it is the health view.

## Data and commands

```
pnpm athena:export liquor-stores liquor-store-skus   # data/raw/, gitignored
pnpm athena:export pricing                           # optional, for price, margin and opportunity
pnpm stores                                          # dist/stores/, gitignored
```

- `liquor_stores.sql`: one row per store with orders, dates and 12-month spend. No contact details.
- `liquor_store_skus.sql`: store × SKU for the catalog's SKUs (the runner fills `{{CATALOG_SKUS}}` from the match file), with cases and the last order date. Rerun it after new SKUs are added.
- `pnpm stores` writes `dist/stores/liquor.json` (everything the site needs), `liquor-stores.csv` and `liquor-voids.csv` (each store's 30 must and should voids most bought by its peers).

Store names, spend, prices and costs are never committed; they reach only the gitignored outputs and, later, the private site build.

## What the first run shows (2026-09-30)

1,993 stores: **1,541 active**, 452 inactive (a median 132 days since their last order).

| Tier | Stores | Active | Median must coverage | Top quarter | Median catalog score | Median fading items |
|---|---|---|---|---|---|---|
| 1–5 orders | 361 | 109 | 6% | 13% | 4 | 16 |
| 6–20 | 694 | 537 | 22% | 31% | 17 | 59 |
| 21–50 | 581 | 545 | 38% | 47% | 29 | 97 |
| 51+ | 357 | 350 | 50% | 58% | 39 | 107 |

- **Even the best customers buy half the must list from us.** No store buys more than 75% of it; 331 stores buy under 10%.
- **By department** (median store, and the 51+ tier): drinks 24% / 43%, soft drinks 19% / 33%, candy & snacks 12% / 29%, household 8% / 20%, grocery 7% / 17%, health & beauty 5% / 19%, mixers & bar 4% / 15%, tobacco 0% / 4%. Health & beauty, grocery and household are where frequent buyers still leave the most on the table.
- **Trend among active stores:** 486 up, 595 flat, 357 down, 103 new.
- **Most common must voids at active stores** (where at least half the store's tier buys the item): Arizona 22oz Kiwi Strawberry (884 stores), Dr Pepper 20oz (836), Arizona Watermelon (821), Arizona Fruit Punch (781), Arizona Mucho Mango (761), Sprite 2L (727), Vitaminwater XXX (709), Sprite 20oz (679), Coca-Cola Zero 20oz (668), Coca-Cola 16oz can (633).
- **Arizona 22oz is fading across the board.** Its matched SKUs' 90-day store share is about half the 12-month share for almost every flavor (Mucho Mango 64% → 34%, Kiwi Strawberry 57% → 25%, Watermelon 62% → 28%), in a 90-day window that is mid-summer. **Cause (Rick, 2026-09-30): manufacturer and stock issues**, not stores dropping the line. Until supply recovers, Arizona fading and Arizona voids are a supply signal, not a store-health or sales signal.

## Matching fix found on the way

Store coverage is sensitive to SKUs the match file misses: a store that buys the same product under another SKU looks like a void. 30 approved SKUs had an unmatched twin, the same product under a different price label or case count. The biggest were the Arizona 22oz **NON PRE-PRICED** cans (21–26% of stores each), then Top Ramen 24-pack, 5-Hour Energy 24-pack and single Old Spice. All 30 were added as approved (reviewer `claude`, note naming the SKU they duplicate); Rick can reject any. Two Arizona SKUs with no catalog item at all, **Blueberry White Tea NON PRE-PRICED (36% of stores)** and **Lemonade PRE-PRICED (31%)**, are candidates for the catalog.

## Next

The Stores tab on the site (overview, store table, store detail with voids, void table grouped by store or item), built from `dist/stores/liquor.json` into the private site and the single HTML file.
