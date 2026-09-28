# Handoff — Phase 0 complete, Phase 1 not started

Branch: `claude/nifty-gates-ux5xvt`. Last updated 2026-09-28.

## Where things stand

- `docs/PLAN.md` — the approved plan. Phases 1–4 are unchanged and are the next agent's job.
- `docs/exploration/liquor.md` — the liquor-store outline. All eight departments are `discussed` with Rick. The top of the file has the ten agreed **modeling rules**; each department ends with a **decisions log**. Read the rules before designing the schema.
- `docs/exploration/prior-attempt.md` and `prior-attempt-taxonomy.md` — review of the old Mercaso order-form spreadsheet and its department tree. The spreadsheet itself (`mercaso_old_sheet.xlsx`) is not committed because it carries prices; ask Rick for it. It is a useful Phase 4 matching fixture: every row is a Mercaso item number with a parseable description.

## Phase 0 exit gate still open

**Sales cross-check** (described at the top of `liquor.md`): compare the outline against Athena sales for liquor-store customers to catch good movers the outline missed. Blocked: the AWS keys in this cloud environment are rejected by STS (`InvalidClientTokenId`). Needs working credentials, region, and the Athena database/table names from the data team. Output goes to `docs/exploration/sales-crosscheck.md`; departments move to `agreed` after Rick reviews it.

## Phase 1 starting points

- Stack decided: pnpm, TypeScript, YAML data files, JSON Schema, `scripts/validate.ts`, `scripts/build.ts`; Next.js + D3 tree viewer in Phase 3. Node 22 and pnpm are available in the cloud environment.
- Node kinds: `department | category | subcategory | brand_line | variant | size | assortment_slot`. Leaf is `size` (branded) or `assortment_slot` (assortment).
- Assortment slot attrs: `target_count {min,max}`, `mix [value|national|hispanic]`, `size_class`, `brand_hints[]`.
- Other attrs agreed: `age_restricted`, `restricted: CA`, `cross_ref` (mixers point at the canonical node, no duplication).
- Store-type file lists node ids with `must | should | nice`; priority inherits down the tree.
- Prove the model with SCD (department 1) end to end first, then encode the rest one department per PR.

## Open items for Rick

- Athena credentials and table names for the cross-check.
- Guerrero tortillas: appear once in the old sheet; confirm stocked or drop.
- Lines 4.1–4.4 (cigarettes, cigars, pouches, smokeless) are market-knowledge drafts; confirm against stock.
