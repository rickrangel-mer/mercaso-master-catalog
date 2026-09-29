# Store Master Catalog — Plan

## Context

Mercaso needs a "cheat sheet" of what a given store type should carry. Liquor stores first, then laundromats, then grocery/markets. It is the foundation for later projects (assortment gap analysis, recommendations, onboarding, sales-rep tooling). The repo `mercaso-master-catalog` is empty, so this is greenfield.

Decisions made in discussion:
- The catalog is a **tree**: `Store type → Department → Category → Subcategory → … → Leaf`.
- **Two kinds of leaf**, because the recommendation is different by department:
  - **Branded leaf** where the brand *is* the recommendation (beverages, some candy & snacks): `Brand line → Variant → Size`, e.g. Cola → Coca-Cola → Zero → 20oz. Maps to one Mercaso SKU (or a tight equivalence set).
  - **Assortment leaf** where the recommendation is coverage, not a brand (household, kitchen, health & beauty, paper, cleaning, and similar): e.g. "Dish soap · single-serve/small" with a target such as "carry 2–3 options, at least one value and one national brand". Maps to *many* Mercaso SKUs; matching attaches all qualifying SKUs and ranks them.
- **Catalog is authored as versioned data files** in the repo; a **read-only family-tree web UI** (Next.js + React + D3) renders it. Browser editing is a later phase.
- **Mercaso's sellable catalog lives in Athena**; matching pulls from there.
- **Authoring is a mix**: LLM/industry draft for structure, Athena sales data for prioritization, expert sign-off.
- The work starts with an **exploration phase** where categories and structure are discussed conversationally before anything is encoded.
- Stack: TypeScript throughout.

## Phases

### Phase 0 — Exploration (conversation + a living document, no code)

Goal: agree on the liquor-store taxonomy and where the branded/assortment line falls, department by department.

- **Step 0a — Review the prior attempt.** You share a document from an earlier attempt at this catalog (Google Drive link, file in the repo, or pasted). I read it first and produce a short assessment in `docs/exploration/prior-attempt.md`: what structure it used, which categories/brands/priorities are worth carrying forward, what to drop, and what it was missing. The department outline below starts from that, not from scratch.
- Work in `docs/exploration/liquor.md` in the repo (or a shared doc if preferred). One section per department. Each session covers one or two departments: I propose categories, subcategories, brand lines or assortment slots, variants that make sense, and priority; you correct, cut, add.
- Suggested order for liquor: SCD (worked example, already discussed) → water & energy & juice → candy & snacks → tobacco accessories & lighters → ice, mixers, cups/bags → household & kitchen → health & beauty → grocery staples.
- Output of Phase 0: a discussed outline plus the modeling rules that came out of it. This outline is the input to Phase 2. **Status: done 2026-09-28**, see `docs/exploration/liquor.md`.
- Alcohol, beer and wine are out of scope per the brief.

### Phase 1 — Data model + repo scaffold

- pnpm workspace, TypeScript, JSON Schema for the data files, `scripts/validate.ts` (ids unique, references resolve, schema check), `scripts/build.ts` (YAML → `dist/<store-type>.json`), CI running validate on PRs.
- Node shape: `id` (stable slug, e.g. `scd.cola.coca-cola.zero.20oz`), `name`, `kind` (department | category | subcategory | brand_line | variant | size | assortment_slot), `attrs`, `children`.
- Assortment slot attrs: `target_count` (`{min, max}`, e.g. 2–3), `mix` (from `value | national | hispanic`), `size_class`, `brand_hints` (brands that help matching; not part of the leaf).
- Other attrs: `age_restricted`, `restricted` (states, e.g. `[CA]` for menthol), `cross_ref` (points at the canonical node instead of duplicating it).
- Store-type file (`data/store-types/liquor.yaml`) references node ids and adds `priority` (must | should | nice) with inheritance down the tree, plus notes.
- Vocabulary follows the modeling rules in `docs/exploration/liquor.md`; those rules win over any older wording here.
- **Status: done 2026-09-29.** See `docs/data-model.md` for the file formats as built.
- Match rows (`data/matches/liquor.csv`): `node_id, mercaso_sku, rank, confidence, status (auto | approved | rejected), source (rule | llm | manual), reviewer, note`. Branded leaves expect 1–few rows; assortment leaves expect many.
- `build.ts` resolves priority per node and summarizes match status per leaf: branded → matched | gap; assortment → covered (≥ target_count approved SKUs) | partial | gap.

### Phase 2 — Encode the liquor catalog

- Translate the Phase 0 outline into `data/taxonomy/*.yaml` (shared structure, reusable by other store types) and `data/store-types/liquor.yaml`.
- Start with SCD end to end to prove both the model and the validator, then the rest in the Phase 0 order, one PR per department for review.
- **Status: done 2026-09-29.** All eight departments are encoded, with one commit per department. The Athena prioritization pass moves to Phase 2.5 because it needs the same credentials.
- Prioritization pass: `scripts/athena/export-sales.ts` pulls sales by category for liquor-store customers; a ranking script proposes priorities; expert adjusts in PR review.

### Phase 2.5 — Sales cross-check (Athena)

- Query Athena for liquor-store customers, trailing 12 months: units and revenue by category and item.
- Compare against the encoded catalog: top movers that map to no node → candidate additions; `must` nodes with negligible sales → candidate downgrades; brand-level sanity where the outline defers to data (aloe, coconut water, Mexican candy, energy drinks, tobacco lines 4.1–4.4).
- Output `docs/exploration/sales-crosscheck.md` with a decision column; Rick reviews; departments move to `agreed`.
- Needs working AWS credentials, region, and Athena database/table names. The keys in the cloud environment as of 2026-09-28 are rejected by STS.

### Phase 3 — Family-tree web UI (read-only)

- `apps/web` Next.js app loading `dist/<store-type>.json`. D3 hierarchy, collapsible horizontal tree with branches, store-type switcher, search/filter, node detail panel (attrs, priority, matched SKUs or assortment coverage), color by priority, badge by match status. Branded and assortment leaves rendered distinctly.
- Deploy as static export or Vercel.
- Built after Phase 2 has at least SCD encoded so the tree has real data; can start in parallel once Phase 1's JSON shape is fixed.
- **Status: done 2026-09-29.** `pnpm web:dev` runs it; `pnpm web:build` writes a static site to `apps/web/out/`. Not deployed yet; hosting is Rick's call.

### Phase 4 — Matching to Mercaso's catalog

1. **Ingest**: `scripts/athena/export-products.ts` queries Athena (`@aws-sdk/client-athena`, results via S3) for the product dimension: sku, name, brand, category fields, size/pack, active flag. Cached to `data/raw/products.csv` (gitignored). Confirm table and column names with the data team first.
2. **Candidate generation** (`scripts/match/candidates.ts`): normalize names (brand dictionary, variant keywords zero/diet/caffeine-free, size regex), match against leaf attrs. Branded leaves: exact brand+variant+size. Assortment leaves: category + size_class + form filters, returning all qualifying SKUs with a rank from sales velocity.
3. **LLM classification** (`scripts/match/classify.ts`): products with no rule match get name + description + the relevant subtree; the model returns best leaf id and confidence. Batched and cached by SKU.
4. **Human review**: `review-export.ts` writes low-confidence rows to CSV; reviewer sets status; import back to `data/matches/liquor.csv`.
5. **Gap report** (`scripts/match/gaps.ts`): must-carry branded leaves with no approved SKU, and assortment leaves below `target_count`. This is a sourcing list and a first-class output.

### Later (out of scope now)

Editable UI with DB persistence; laundromat and market store types (reuse taxonomy, add store-type files); API serving `dist/*.json` to the Mercaso app; per-store gap analysis (a store's order history vs. the master catalog).

## Repo layout

```
docs/exploration/liquor.md        # Phase 0 working outline
data/taxonomy/                    # shared tree: departments.yaml, categories/*.yaml
data/store-types/liquor.yaml      # node picks + priority
data/matches/liquor.csv           # node → Mercaso SKU
data/raw/                         # Athena exports, gitignored
schema/catalog.schema.json
scripts/{validate,build}.ts
scripts/athena/{export-products,export-sales}.ts
scripts/match/{candidates,classify,review-export,gaps}.ts
apps/web/                         # Next.js tree viewer
dist/                             # built JSON, gitignored
```

## Verification

- Phase 0: outline reviewed and signed off department by department.
- Phase 1–2: `pnpm validate` passes in CI; `pnpm build` emits `dist/liquor.json` with SCD fully populated and priorities resolved.
- Phase 3: `pnpm dev` renders the liquor tree; SCD → Cola → Coca-Cola shows Classic/Zero/Diet → sizes; Household → Cleaning → Dish soap shows an assortment slot with its target and coverage.
- Phase 4: `pnpm athena:export` writes `products.csv`; `pnpm match` fills `matches/liquor.csv` with ≥90% of SCD branded leaves matched and assortment leaves populated; `pnpm gaps` lists unmatched must-carry items; the UI reflects the statuses.
