# Handoff — Phases 1–4 done; the static site is ready

Mainline: `main` (default). New work goes in PRs against `main`. **One open PR at a time** (Rick, 2026-09-30): finish or fold follow-up work into the open PR instead of opening a second one that edits the same files, and start the next branch from `main` only after it merges. Last updated 2026-09-30.

## Where things stand

- `docs/PLAN.md` — the approved plan. Phases 0–4 and 2.5 are done.
- `docs/data-model.md` — file formats, commands, and what the validator checks. Read this before touching `data/`.
- `docs/exploration/liquor.md` — the liquor-store outline, the ten **modeling rules**, and the **encoding conventions** used to turn the outline into data.
- `data/taxonomy/departments/` — all eight departments. `data/store-types/liquor.yaml` — liquor priorities, notes, `state: CA`.
- `apps/web` — the static site (Next.js, static export), in three tabs: **Overview** (headline numbers, coverage by department and priority, open must items), **Catalog chart** (the top-down org chart, d3-zoom) and **SKU table** (every matched Mercaso SKU with priority, type, penetration, price and margin; pivot-style groups with subtotals, sort, filter, CSV download). The tab is in the URL hash (`#overview`, `#chart`, `#table`). `pnpm web:dev` to run it; `pnpm web:html` builds it as a single HTML file to share.

## Numbers (liquor store, CA build)

| Leaves | Must | Should | Nice | Dropped as not sold in CA |
|---|---|---|---|---|
| 1,047 | 197 | 409 | 441 | 17 nodes |

Before the sales cross-check: 945 leaves (191 must, 370 should, 384 nice).

## Sales cross-check applied (2026-09-29)

Rick accepted all 106 proposals in `docs/exploration/sales-crosscheck.md`, and they are applied in `data/`. All eight departments are `agreed`. The 12-month store share is the main number; the 90-day share is the fallback where an item launched, changed or was discontinued during the year. Highlights:
- **New sizes:** 16oz cans for Coca-Cola, Sprite, Dr Pepper, Pepsi and Squirt; 24oz bottles for Coca-Cola and Sprite (they replaced the 1L); 1L for Dr Pepper, Pepsi and Squirt. Arizona moved to 22oz cans. Vitaminwater 28oz.
- **New lines:** Peñafiel, Starbucks Espresso & Doubleshot, Guayakí, NOS, V8, Tropicana, Faygo, Bundaberg, Almond Joy, Butterfinger, Nestlé Crunch, Milky Way, AMOS Peelerz, Gushers, Sour Punch, Sour Strips, Abba-Zaba, Efrutti, Toxic Waste, El Sabroso cracklins, ACT II, Arachi, Barebells, and cooler and butane slots.
- **Dropped:** Mirinda, Fresca, Barq's, Seagram's; Baja Micheladas Hot and Pineapple (discontinued); Lucas Pelucas; Clover Hill; OKF Guava and Tamarindo.
- **Every `verify: sales` flag is resolved.** Of the `verify: stock` flags, only the four tobacco categories remain.

The encoding choices this handoff used to list for confirmation are settled. Where the cross-check changed one, it wins:
- **Baja Micheladas:** Original should, Mango nice.
- **Schweppes:** nice.
- **Clamato Picante:** should.
- **Tajín:** the "Fruit" is the 5oz Clásico; Mini added at must.
- **Mega:** now should.
- **Hot sauce:** sizes confirmed.
- **Stand-in flavors:** replaced by the sales ranking.

Unchanged: Zyn, the CA flavored-tobacco drops, sandwich bags in department 5, Red Bull Sugar Free, and cigarette cartons at should.

## Matching (Phase 4, 2026-09-29)

- `pnpm match` proposes Mercaso SKUs into `data/matches/liquor.csv`; `pnpm gaps` writes `docs/exploration/liquor-gaps.md`. Both are in `scripts/match/`, with tests.
- Every top pick was reviewed in-session: 52 wrong matches rejected, 16 added by hand (Marlboro Red, Tajín, Mega Chamoy and others). Rick approved the 1,081 matches at confidence 0.6 or higher; the rest stay pending.
- Coverage (2026-09-30, after Rick's first review round and the H&B and grocery slot review): **897 of 1,047 items** have an approved SKU (must 195 of 197, should 370 of 409, nice 332 of 441). The 2 must misses, Topo Chico Twist of Lime and Black & Mild Original 5-pack, are products Mercaso does not stock. (At the end of Phase 4 it was 865 of 1,038, must 188 of 192.)
- The site shows each item's matched products by name, SKU, case pack, status, 12-month and 90-day penetration (`share_12m`, `share_90d` columns in the match file, refreshed by `pnpm match`), and today's price and margin.

## Prices and margin (2026-09-29)

- `pnpm athena:export pricing` writes `data/raw/pricing.csv`: price = promo price when on promo, else the regular price without CRV; cost = Finale's `average_cost` (from `ods.ods_finale_report_of_product_full`, which includes CRV) minus the case CRV. Margin = (price − cost) ÷ price.
- Prices and costs never go in git. The web build (`apps/web/scripts/copy-data.mjs`) writes `public/data/prices.json` (gitignored) for the catalog's SKUs only; without the export the site builds without the price columns.
- **The built site in `apps/web/out/` does contain prices and costs.** Host it only somewhere private.
- About 6 catalog SKUs show a negative margin; they look like cost-data problems in Finale (e.g. DW13542-24 costed at $70.06 against a $47.99 price).
- Chips carry 2.5–3.25oz bags beside XVL (rule 4, Rick 2026-09-29).

## Next steps

1. **Share the site as a file** (the choice for now): `pnpm web:html` writes `dist/site/mercaso-liquor-catalog-<date>.html` (with price and margin) and `...-no-prices.html`. Share the priced file only privately, e.g. a restricted Drive folder; people download it and open it in a browser (Drive's preview shows only the source). Hosting is in the backlog (`docs/PLAN.md`, Later); `pnpm web:build` still writes the multi-file site to `apps/web/out/`.
2. **Review sheets, round 2:** Rick's first round is imported (2026-09-30: 10 approved, 55 rejected, 11 SKUs from the gap sheet). `docs/review/liquor-pending.csv` now holds 31 new pending matches on 18 items (mostly the matcher's next pick where Rick rejected the first) and `docs/review/liquor-gaps.csv` 132 items with no SKU. Fill `decision` (approve/reject) and `mercaso_sku` (the import also accepts SKUs typed in `target_skus`), save over the same paths, then `pnpm review import`, `pnpm match`, `pnpm gaps` and `pnpm review export`. Importing the same sheet twice is harmless.
3. **Sourcing:** the gap sheet is the working list; `docs/exploration/liquor-gaps.md` is the readable version (2 must, 38 should, 92 nice). The two must gaps are Topo Chico Twist of Lime and Black & Mild Original 5-pack, which Mercaso does not stock.
4. **Health & beauty and grocery slot review: done** (`docs/exploration/slot-review-hb-grocery.md`, all 25 proposals accepted 2026-09-30). Two cotton-candy drinks approved on the cotton-swab slot were rejected. Every assortment department has now had a sales review.
5. **Store penetration (Phase 5):** 5a is in (`docs/exploration/store-penetration.md`, `pnpm stores`). Next is 5b, the Stores tab on the site. Arizona 22oz is fading at most stores (90-day share about half the 12-month share) because of manufacturer and stock issues (Rick, 2026-09-30), so read Arizona voids as supply, not store health. Two unmatched Arizona SKUs (Blueberry White Tea NON PRE-PRICED 36% of stores, Lemonade PRE-PRICED 31%) are catalog candidates.
6. **Refreshing:** `data/raw/` is gitignored; a new session runs `pnpm athena:export` (`liquor-store-skus` after `pnpm match`, since it uses the match file), then `pnpm match` (keeps all review decisions), `pnpm gaps`, `pnpm stores` and `pnpm web:html`.

## Open items for Rick

- The key belongs to the IAM user `meng.local`. If that is someone's personal user, consider a dedicated read-only user for this repo.
- Lines 4.1–4.4 (cigarettes, cigars, pouches, smokeless) are market-knowledge drafts. Mercaso's sales agree with their order; Rick is leaving them as they are for now (2026-09-30).
- Negative margins on about 6 SKUs: set aside for now (Rick, 2026-09-30).
