# Mercaso Store Master Catalog

A "cheat sheet" of what a given store type should carry, starting with liquor stores, then laundromats, then grocery/markets. Non-alcoholic scope only for liquor (alcohol, beer and wine are out of scope).

The catalog is a tree: Store type → Department → Category → Subcategory → … → Leaf. Leaves come in two kinds:

- **Branded leaf**: the brand is the recommendation (beverages, some candy and snacks). Brand line → Variant → Size, mapped to one Mercaso SKU.
- **Assortment leaf**: coverage is the recommendation (household, kitchen, health and beauty). A slot with a target count and mix, mapped to many Mercaso SKUs.

## Status

Phases 1 to 3 done: data model, validator, build and CI; all eight liquor-store departments encoded; and a read-only family-tree viewer in `apps/web`. Next are the Athena sales cross-check (Phase 2.5) and SKU matching (Phase 4), both waiting on Athena access. See [docs/HANDOFF.md](docs/HANDOFF.md) for where things stand, [docs/PLAN.md](docs/PLAN.md) for the plan and [docs/data-model.md](docs/data-model.md) for the file formats.

## Quick start

```
pnpm install
pnpm validate
pnpm build     # writes dist/liquor.json
pnpm web:dev   # tree viewer at http://localhost:3000
pnpm web:build # static site in apps/web/out/
```

## Layout

```
docs/exploration/          Phase 0 working outlines and prior-attempt review
data/taxonomy/             shared tree: index.yaml plus one file per department
data/store-types/          per store type: what it carries and at what priority
data/matches/              node to Mercaso SKU rows
schema/                    JSON Schema for the data files
scripts/                   validate, build; Athena export and matching come later
apps/web/                  read-only org-chart viewer (Next.js + d3-zoom, static export)
```
