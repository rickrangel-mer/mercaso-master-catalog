# Handoff — Phase 1 done, Phase 2 in progress

Mainline: `main` (default). New work goes in PRs against `main`. Last updated 2026-09-29.

## Where things stand

- `docs/PLAN.md` — the approved plan. Phase 1 is done; Phase 2 has SCD encoded.
- `docs/data-model.md` — file formats, commands, and what the validator checks. Read this before touching `data/`.
- `docs/exploration/liquor.md` — the liquor-store outline and the ten **modeling rules**. It is the source for every department still to encode.
- `docs/exploration/prior-attempt.md` and `prior-attempt-taxonomy.md` — review of the old Mercaso order-form spreadsheet. The spreadsheet is not committed because it carries prices; ask Rick for it. It is a useful Phase 4 matching fixture.

## What Phase 1 built

- pnpm + TypeScript project. `pnpm validate`, `pnpm build`, `pnpm test`, `pnpm typecheck`; CI runs all four.
- `schema/catalog.schema.json` for the YAML shapes; `scripts/lib/` for the tree, store-type and match checks.
- Sizes are generated from `size_defs` and `sizes` lists, so variants never repeat size nodes by hand.
- Store types can set `state`; nodes marked `restricted` in that state are dropped from the build (menthol in CA).
- Match rows carry `case_pack`, so one leaf can hold more than one case option (rule 3).

## SCD encoding choices to confirm with Rick

- Take-home sizes are must only for Coca-Cola, Pepsi, Sprite and Squirt. Other must variants (Dr Pepper, Mountain Dew, Fanta Orange, A&W, the top Jarritos) carry 2L or 1.5L at should.
- Canada Dry: Ginger Ale 20oz and Club Soda and Tonic 1L are must; their other sizes are should.
- Every variant gets all of its brand line's sizes. Sizes Mercaso does not stock will show as gaps in Phase 4 and can be pruned then.
- Diet Mountain Dew had no priority in the outline; set to nice.
- Mirinda, Fresca and Manzanita Sol have one placeholder variant each and `verify: sales`. Shasta has only its colas, also `verify: sales`.
- The LA-market notes (Mexican Coke, Squirt, top four Jarritos must) are store notes on the liquor store type, which is set to `state: CA`.

## Next steps

1. Encode department 2 (water, energy, sports, juice, RTD tea and coffee, michelada mixes) in `data/taxonomy/departments/`, add it to `index.yaml` and `include`, set priorities. One PR.
2. Continue in the Phase 0 order, one department per PR. Department 5 mixers use `cross_ref` to SCD and juice nodes. Tobacco lines 4.1–4.4 get `verify: stock`, menthol gets `restricted: [CA]`, tobacco gets `age_restricted: true`.
3. Phase 3 (viewer) can start in parallel now that `dist/liquor.json` has a fixed shape.

## Phase 2.5 — sales cross-check (deferred)

Compare the encoded catalog against Athena sales for liquor-store customers. Blocked until working AWS credentials, region, and Athena table names are available; the keys in this cloud environment are rejected by STS (`InvalidClientTokenId`). Nodes with `verify: sales` are the brand-level questions to answer there.

## Open items for Rick

- Athena credentials and table names for the Phase 2.5 cross-check.
- Guerrero tortillas: appear once in the old sheet; confirm stocked or drop.
- Lines 4.1–4.4 (cigarettes, cigars, pouches, smokeless) are market-knowledge drafts; confirm against stock.
- The SCD encoding choices above.
