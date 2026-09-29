# Data model

How the catalog is stored and checked. The rules behind it are the ten modeling rules at the top of `docs/exploration/liquor.md`.

## Commands

```
pnpm install
pnpm validate    # check every data file; exits 1 on errors
pnpm build       # write dist/<store-type>.json (refuses if validation fails)
pnpm test        # unit tests for the validator and build
pnpm typecheck
```

CI runs all four on every pull request and on pushes to `main`, then builds the tree viewer.

`pnpm web:dev` builds the catalog and starts the viewer. It reads `dist/*.json`, copied into `apps/web/public/data/` by its `copy-data` script.

## Files

```
schema/catalog.schema.json               shapes of the YAML files
data/taxonomy/index.yaml                 department keys, in display order
data/taxonomy/departments/<key>.yaml     one tree per department, shared by all store types
data/store-types/<store-type>.yaml       what a store type carries and at what priority
data/matches/<store-type>.csv            node to Mercaso SKU rows (Phase 4)
dist/<store-type>.json                   build output, gitignored
```

## Taxonomy files

Each department file is one tree. Every node has `key`, `name` and `kind`.

| Kind | May contain |
|---|---|
| `department` | `category` |
| `category`, `subcategory` | `subcategory`, `brand_line`, `assortment_slot` |
| `brand_line` | `variant` |
| `variant` | size leaves, generated from `sizes` |
| `assortment_slot` | nothing; it is a leaf |

**Ids.** A node's id is its keys from the department down, joined by dots, for example `scd.cola.coca-cola.zero-sugar.20oz`. Keys are lowercase letters, digits and hyphens. Renaming a key changes the id of everything below it, so keys should be treated as stable once matches exist.

**Branded leaves.** Sizes are never written out by hand. A department, category, subcategory or brand line declares `size_classes` (the vocabulary, rule 4) and `size_defs` (the retail units). A brand line lists `sizes`, and each variant gets one size leaf per entry. A variant with its own `sizes` overrides its brand line.

```yaml
size_classes:
  single: Grab-and-go
  take_home: 1L to 3L
size_defs:
  20oz: { name: 20oz bottle, size_class: single, container: bottle, volume_ml: 591 }
  2l: { name: 2L bottle, size_class: take_home, container: bottle, volume_ml: 2000 }
children:
  - key: coca-cola
    name: Coca-Cola
    kind: brand_line
    sizes: [20oz, 2l]
    children:
      - { key: classic, name: Classic, kind: variant }
      - { key: cherry, name: Cherry, kind: variant, sizes: [20oz] }
```

A nested `size_classes` replaces the inherited vocabulary. A nested `size_defs` adds to the inherited definitions.

**Assortment leaves.** A slot needs `target_count`. It may also set `mix`, `size_class` and `brand_hints`.

```yaml
- key: dish-soap
  name: Dish soap
  kind: assortment_slot
  target_count: { min: 2, max: 2 }
  mix: [value, hispanic]
  size_class: [small]
  brand_hints: [Palmolive, Ajax]
```

**Attributes on any node.**

| Field | Meaning |
|---|---|
| `note` | Free text shown in the viewer. |
| `verify` | `sales` or `stock`: the outline defers this node to data. Phase 2.5 works through these. |
| `age_restricted` | Applies to the whole subtree. |
| `restricted` | States where the subtree must not be recommended, e.g. `[CA]` for menthol. |
| `cross_ref` | Ids of canonical nodes this node points at, so nothing is duplicated (rule 10). |

**Links.** A category or subcategory may have `cross_ref` and no children. It is then a pure link, like the mixers in department 5. A link has no priority of its own; the store type sets priority on the node it points at, and setting one on the link is an error.

**Slots inside branded categories.** When the outline says "carry one of these brands" or "top flavors" without naming them, the leaf is an `assortment_slot` even in a branded category. The brands go in `brand_hints`.

## Store-type files

```yaml
store_type: liquor        # must match the file name
name: Liquor store
state: CA                 # nodes restricted in CA are dropped from the build
include: [scd]            # subtrees carried
exclude: []               # subtrees removed from the included ones
priority:
  scd.cola.coca-cola.classic: must
  scd.cola.dr-pepper: should
  scd.cola.dr-pepper.original: must
notes:
  scd.cola.coca-cola-mexican: Must in the LA market.
```

A priority covers the node's whole subtree until a descendant sets its own. Every carried leaf must resolve to a priority, or validation fails. A priority that repeats the inherited one is a warning.

## Match files

`data/matches/<store-type>.csv` has this header:

```
node_id,mercaso_sku,case_pack,rank,confidence,status,source,reviewer,note
```

`node_id` must be a size or assortment-slot leaf. `status` is `auto`, `approved` or `rejected`. `source` is `rule`, `llm` or `manual`. Approved and rejected rows need a reviewer. `case_pack` carries the case option (rule 3), so one leaf can hold a 24-count and a 35-count row.

The build computes coverage per leaf from approved rows:

| Leaf | Status |
|---|---|
| Size | `matched` with at least one approved SKU, otherwise `gap` |
| Assortment slot | `covered` at or above `target_count.min`, `partial` below it, `gap` at zero |

## Build output

`dist/<store-type>.json` holds the carried tree. Each node has `id`, `key`, `name`, `kind`, `attrs`, and where they apply `priority`, `priority_source` (`explicit` or `inherited`), `note`, `store_note`, `match` and `children`. Restriction flags are inherited into `attrs`, so a viewer can filter on any node. A top-level `summary` counts leaves by kind, priority and match status, counts `verify` flags, and lists the nodes dropped for the store type's state.
