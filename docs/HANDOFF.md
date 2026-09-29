# Handoff — Phases 1–3 and 2.5 done; Phase 4 is next

Mainline: `main` (default). New work goes in PRs against `main`. Last updated 2026-09-29.

## Where things stand

- `docs/PLAN.md` — the approved plan. Phases 0–3 and 2.5 are done.
- `docs/data-model.md` — file formats, commands, and what the validator checks. Read this before touching `data/`.
- `docs/exploration/liquor.md` — the liquor-store outline, the ten **modeling rules**, and the **encoding conventions** used to turn the outline into data.
- `data/taxonomy/departments/` — all eight departments. `data/store-types/liquor.yaml` — liquor priorities, notes, `state: CA`.
- `apps/web` — read-only viewer laid out as a top-down org chart, modeled on the Rippling org diagram (Next.js + d3-zoom, static export). `pnpm web:dev` to run it.

## Numbers (liquor store, CA build)

| Leaves | Must | Should | Nice | Dropped as not sold in CA |
|---|---|---|---|---|
| 1,024 | 190 | 401 | 433 | 17 nodes |

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

## Next steps

1. **Assortment slot review** (`docs/exploration/assortment-slot-review.md`). Household and mixers and bar are done: suggested brands, names and item counts are applied, and 25 priority and structure proposals (part B) await Rick's Decision column. Apply the accepted rows, then review health and beauty and grocery the same way.
2. **Phase 4 — matching.** Reads the products export; the item table has UPCs. The old order-form spreadsheet (not committed; it carries prices) is a good matching fixture. First revisit rule 4 ("chips: XVL only", see `docs/exploration/liquor.md`): XVL bags barely sell through Mercaso.
3. **Rerunning the cross-check.** Athena works (`pnpm athena:check`). `data/raw/` is gitignored, so a new session runs `pnpm athena:export`, then `pnpm crosscheck`. The script in `scripts/crosscheck/` is a rough screening matcher; its limits are in section 8 of the report.
4. **Deploy the viewer** if wanted: `pnpm web:build` writes a static site to `apps/web/out/`.

## Open items for Rick

- **Remove `AWS_SESSION_TOKEN` from the environment settings.** The key is a long-term `AKIA` key, and AWS rejects that key when a session token comes with it. The runner now ignores the token and warns, so nothing is blocked.
- The key belongs to the IAM user `meng.local`. If that is someone's personal user, consider a dedicated read-only user for this repo.
- Lines 4.1–4.4 (cigarettes, cigars, pouches, smokeless) are market-knowledge drafts. Mercaso's sales agree with their order, but only a check of store shelves can confirm them.
- Where to host the viewer, if anywhere.
