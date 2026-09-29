# Handoff — Phases 1–4 done; the static site is ready

Mainline: `main` (default). New work goes in PRs against `main`. Last updated 2026-09-29.

## Where things stand

- `docs/PLAN.md` — the approved plan. Phases 0–4 and 2.5 are done.
- `docs/data-model.md` — file formats, commands, and what the validator checks. Read this before touching `data/`.
- `docs/exploration/liquor.md` — the liquor-store outline, the ten **modeling rules**, and the **encoding conventions** used to turn the outline into data.
- `data/taxonomy/departments/` — all eight departments. `data/store-types/liquor.yaml` — liquor priorities, notes, `state: CA`.
- `apps/web` — the static site (Next.js, static export), in three tabs: **Overview** (headline numbers, coverage by department and priority, open must items), **Catalog chart** (the top-down org chart, d3-zoom) and **SKU table** (every matched Mercaso SKU with priority, type, penetration, price and margin; pivot-style groups with subtotals, sort, filter, CSV download). The tab is in the URL hash (`#overview`, `#chart`, `#table`). `pnpm web:dev` to run it; `pnpm web:html` builds it as a single HTML file to share.

## Numbers (liquor store, CA build)

| Leaves | Must | Should | Nice | Dropped as not sold in CA |
|---|---|---|---|---|
| 1,038 | 192 | 409 | 437 | 17 nodes |

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
- Coverage: **865 of 1,038 items**, including 188 of 192 must. The 4 must misses: Topo Chico Twist of Lime and Black & Mild Original 5-pack (Mercaso has none), and the corkscrew and bottle-opener slots (correct but unbranded matches at 0.50 confidence, still pending).
- The site shows each item's matched products by name, SKU, case pack, status, 12-month and 90-day penetration (`share_12m`, `share_90d` columns in the match file, refreshed by `pnpm match`), and today's price and margin.

## Prices and margin (2026-09-29)

- `pnpm athena:export pricing` writes `data/raw/pricing.csv`: price = promo price when on promo, else the regular price without CRV; cost = Finale's `average_cost` (from `ods.ods_finale_report_of_product_full`, which includes CRV) minus the case CRV. Margin = (price − cost) ÷ price.
- Prices and costs never go in git. The web build (`apps/web/scripts/copy-data.mjs`) writes `public/data/prices.json` (gitignored) for the catalog's SKUs only; without the export the site builds without the price columns.
- **The built site in `apps/web/out/` does contain prices and costs.** Host it only somewhere private.
- About 6 catalog SKUs show a negative margin; they look like cost-data problems in Finale (e.g. DW13542-24 costed at $70.06 against a $47.99 price).
- Chips carry 2.5–3.25oz bags beside XVL (rule 4, Rick 2026-09-29).

## Next steps

1. **Share the site as a file** (the choice for now): `pnpm web:html` writes `dist/site/mercaso-liquor-catalog-<date>.html` (with price and margin) and `...-no-prices.html`. Share the priced file only privately, e.g. a restricted Drive folder; people download it and open it in a browser (Drive's preview shows only the source). Hosting behind company sign-in can come later; `pnpm web:build` still writes the multi-file site to `apps/web/out/`.
2. **Approve the rest:** the pending rows in `data/matches/liquor.csv` (status `auto`), including the corkscrew and bottle opener.
3. **Sourcing:** work through `docs/exploration/liquor-gaps.md` (2 must, 39 should, 96 nice).
4. **Assortment slot review for health and beauty and grocery** (as done for household in `docs/exploration/assortment-slot-review.md`).
5. **Refreshing:** `data/raw/` is gitignored; a new session runs `pnpm athena:export`, then `pnpm match` (keeps all review decisions), `pnpm gaps` and `pnpm web:html`.

## Open items for Rick

- **Remove `AWS_SESSION_TOKEN` from the environment settings.** The key is a long-term `AKIA` key, and AWS rejects that key when a session token comes with it. The runner now ignores the token and warns, so nothing is blocked.
- The key belongs to the IAM user `meng.local`. If that is someone's personal user, consider a dedicated read-only user for this repo.
- Lines 4.1–4.4 (cigarettes, cigars, pouches, smokeless) are market-knowledge drafts. Mercaso's sales agree with their order, but only a check of store shelves can confirm them.
- Where to host the viewer, if anywhere.
