# Google Places scrape: one list of every store in the market (test)

Started 2026-10-26 (Rick), on the branch `claude/places-store-matching` as a test of whether the market's store list can come from a Google Places scrape instead of the sales prospect list. It ties each Google place to the Mercaso store it is (customers of the last 24 months).

## Inputs

- `data/raw/places_clean.csv`: the scrape (Rick, 2026-10-26), 13,896 places, one per Google place id, with name, address, ZIP, coordinates and a category (grocery, gas, c_store, liquor, market, laundromat, discount, restaurant, truck_stop).
- `data/raw/store_places.csv` (`pnpm athena:export store-places`): every CA store that ordered in the last 24 months with its name, address, coordinates and stored Google place id.
- `data/raw/prospects.csv`: the sales prospect list (name, city, ZIP; no address).

All three stay in the gitignored `data/raw/`; store names and addresses never reach git.

## Matching

- **Mercaso's stored place ids point to the building, not the business.** Google returns them as "premise" (an address), so none equal the scrape's business ids. Matching is by location and name.
- A customer matches a place when they are within 20 m with a name at least 0.2 similar (a short form of the name at the same spot), within 75 m and 0.35, within 200 m and 0.6, or at the same street number and ZIP with a name at least 0.3 similar. Name similarity is a 0–1 score on the cleaned names (no punctuation, "inc", "llc", store numbers). Matches are one to one, best first. A match whose names are under 0.5 similar is flagged `check` (about 1 in 10); spot checks found most right and some wrong.
- A prospect (name and ZIP only) matches the place in its ZIP with a name at least 0.6 similar, else a customer the scrape missed at 0.75.

## What the first run shows (2026-10-26)

- **The scrape is incomplete, and mostly Los Angeles County.** It finds 42% of today's active customers: 52–62% in the LA zones, 11% in Orange County, 8% in the Inland Empire and none in San Diego (no San Diego places). By type: liquor stores 50% of active ones, markets 54%, laundromats 52%, gas stations 33%; smoke shops, restaurants and non-stores barely (the scrape didn't search for them). Most customers it misses have no place nearby at all, so it's coverage, not matching.
- **Where it does find a store, its category agrees with Mercaso's type 87% of the time.**
- **Against the prospect list:** of the 7,278 prospects with a ZIP, 37% are in the scrape; 167 more are already customers. The 4,843 prospects with no ZIP can't be matched.
- **9,227 places are new to us:** not a customer in 24 months and not on the list.
- **The unified list has 26,954 stores:** 3,701 active, 1,566 stopped in the last 12 months, 800 lapsed 12–24 months, 11,660 never ordered and on the list, 9,227 never ordered and new from the scrape.

## Output

`pnpm places` writes `dist/places/unified.csv` (gitignored; names and addresses) and `dist/places/summary.md`. One row per store: its place id, name, address, ZIP and category; its Mercaso store id, name, type, status (active, stopped in 12 months, lapsed 12–24 months, never ordered) and first and last order; how it was matched and with what confidence; whether it is on the prospect list; where it came from (places, Mercaso, prospect list); its rep (by ZIP) and zone.

## Before it can replace the prospect list

- Rescrape Orange County, the Inland Empire and San Diego, and add smoke shops.
- Review the `check` matches.
- Then the unified list can be the Market tab's market.
