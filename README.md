# Mercaso Store Master Catalog

A "cheat sheet" of what a given store type should carry, starting with liquor stores, then laundromats, then grocery/markets. Non-alcoholic scope only for liquor (alcohol, beer and wine are out of scope).

The catalog is a tree: Store type → Department → Category → Subcategory → … → Leaf. Leaves come in two kinds:

- **Branded leaf**: the brand is the recommendation (beverages, some candy and snacks). Brand line → Variant → Size, mapped to one Mercaso SKU.
- **Assortment leaf**: coverage is the recommendation (household, kitchen, health and beauty). A slot with a target count and mix, mapped to many Mercaso SKUs.

## Status

Phase 0, exploration. See [docs/PLAN.md](docs/PLAN.md) for the full plan and [docs/exploration/liquor.md](docs/exploration/liquor.md) for the working outline.

## Layout (planned)

```
docs/exploration/          Phase 0 working outlines and prior-attempt review
data/taxonomy/             shared tree (departments, categories)
data/store-types/          per store type: node picks + priority
data/matches/              node → Mercaso SKU
schema/                    JSON Schema for data files
scripts/                   validate, build, Athena export, matching
apps/web/                  read-only family-tree viewer (Next.js + D3)
```
