# Handoff — Phases 1–3 done; Phase 2.5 report awaits Rick's decisions

Mainline: `main` (default). New work goes in PRs against `main`. Last updated 2026-09-29.

## Where things stand

- `docs/PLAN.md` — the approved plan. Phases 0–3 are done.
- `docs/data-model.md` — file formats, commands, and what the validator checks. Read this before touching `data/`.
- `docs/exploration/liquor.md` — the liquor-store outline, the ten **modeling rules**, and the **encoding conventions** used to turn the outline into data.
- `data/taxonomy/departments/` — all eight departments. `data/store-types/liquor.yaml` — liquor priorities, notes, `state: CA`.
- `apps/web` — read-only viewer laid out as a top-down org chart, modeled on the Rippling org diagram (Next.js + d3-zoom, static export). `pnpm web:dev` to run it.

## Numbers (liquor store, CA build)

| Leaves | Must | Should | Nice | Dropped as not sold in CA |
|---|---|---|---|---|
| 945 | 191 | 370 | 384 | 17 nodes |

## Choices made while encoding, for Rick to confirm

- **Zyn** (settled 2026-09-29). Mercaso sells Original and Smooth in 3mg and 6mg. The 6mg are must and the 3mg should; flavored Zyn is dropped in CA.
- **Other flavored tobacco** dropped in CA: Marlboro Menthol, Newport Box and 100s, Camel Crush, Swisher Grape, Backwoods Honey and Russian Cream, Black & Mild Casino, Copenhagen Wintergreen. Swisher Original and Diamond confirmed as sold in CA.
- **Baja Micheladas.** All four flavors are must, following the department 5 decision. Section 2.6 had Original and Hot at should.
- **Schweppes** stays should (section 1.5), although the mixers list says must.
- **Sandwich bags** live only in department 5 (should). Department 6 links there.
- **Hot sauce.** Tapatío and Valentina must, El Yucateco should, Cholula and Tabasco nice. Sizes are the common retail bottles, flagged `verify: stock`.
- **Chamoy.** Mega must, Tajín Chamoy should. The outline's "Tajín … Fruit" is unclear.
- **Stand-ins.** Where the outline says "top N flavors" without naming them, the first ones listed stand in and carry `verify: sales`: Sparkling Ice, Calypso, Haribo. Alani Nu and C4 slots use a placeholder target of 2–3.
- **Red Bull Sugar Free.** 8.4oz and 12oz must; 16oz and 20oz should, like Original.
- **Clamato.** 16oz and 32oz must on Original only; Picante and Preparado are nice.
- **Cigarette cartons** of must lines are should, like take-home sizes.

## Next steps

1. **Rick fills in the Decision column** of `docs/exploration/sales-crosscheck.md` (106 rows). The report also bears on five of the encoding choices above: Baja Micheladas (3.6), Schweppes (3.20), Clamato Picante (5.11), the Tajín "Fruit" question (1.12) and the Sparkling Ice, Calypso and energy stand-ins (section 4). A later session applies the accepted rows to `data/` and marks departments `agreed` in `docs/exploration/liquor.md`.
2. **Rerunning the cross-check.** Athena works (`pnpm athena:check`). `data/raw/` is gitignored, so a new session runs `pnpm athena:export`, then `pnpm crosscheck`, which writes `data/raw/crosscheck/*.csv`. The script in `scripts/crosscheck/` is a rough screening matcher. Its limits are in section 8 of the report.
3. **Phase 4 — matching.** Reads the products export; the item table has UPCs. The old order-form spreadsheet (not committed; it carries prices) is a good matching fixture.
4. **Deploy the viewer** if wanted: `pnpm web:build` writes a static site to `apps/web/out/`.

## Open items for Rick

- **Remove `AWS_SESSION_TOKEN` from the environment settings.** The key is a long-term `AKIA` key, and AWS rejects that key when a session token comes with it. The runner now ignores the token and warns, so nothing is blocked.
- The key belongs to the IAM user `meng.local`. If that is someone's personal user, consider a dedicated read-only user for this repo.
- Lines 4.1–4.4 (cigarettes, cigars, pouches, smokeless) are market-knowledge drafts; confirm against stock.
- The encoding choices above, and the Decision column in `docs/exploration/sales-crosscheck.md`.
- Where to host the viewer, if anywhere.
