# Liquor store — exploration outline

Working document for Phase 0. One section per department. Each section states whether the department is **branded** (brand → variant → size leaves) or **assortment** (coverage slots mapped to many SKUs), then lists the proposed tree. Priority levels: **must** (every store), **should** (most stores), **nice** (upside, store-dependent).

Status legend per department: `draft` (proposed, not discussed) · `discussed` (edited with Rick) · `agreed`.

Alcohol, beer and wine are out of scope.

## Department order

1. Soft drinks (SCD) — draft below
2. Water, energy, sports, juice, tea/coffee RTD — pending
3. Candy & snacks — pending
4. Tobacco accessories & lighters — pending
5. Ice, mixers, cups, bags — pending
6. Household & kitchen — pending (assortment)
7. Health & beauty — pending (assortment)
8. Grocery staples — pending (mostly assortment)

Before drafting 2 onward, review the prior attempt (see `prior-attempt.md`) and carry forward what holds up.

---

## 1. Soft drinks (SCD) — `draft`

Kind: **branded**. Leaves are brand line → variant → size.

Size classes used here (to be confirmed as a global rule). Sizes are the **retail unit the store shelves**; the Mercaso SKU is the case (e.g. "20 oz (24 Pack)"), recorded on the match row as `case_pack`.
- `single` — 12oz can, 16oz can, 16.9oz/500ml bottle, 20oz bottle (grab and go, cold box)
- `take_home` — 1L, 1.25L, 2L, 3L
- `multipack` — 6pk 16.9oz, 8pk 12oz mini, 12pk 12oz can

Sizes the old sheet confirms Mercaso stocks for soda: 12oz can, 16oz, 16.9oz, 20oz, 1L, 2L. It does not list retail 12-packs, only 24- and 35-count cases of 12oz cans.

Liquor-store note: single-serve is the core. Take-home 2L is a must for the top two cola lines and lemon-lime. Multipacks are should/nice depending on cooler and shelf space.

### 1.1 Cola

| Brand line | Variants that make sense | Sizes | Priority |
|---|---|---|---|
| Coca-Cola | Classic, Zero Sugar, Diet Coke, Cherry, Vanilla, Caffeine-Free | 12oz can, 20oz, 2L; 12pk should | Classic/Zero/Diet must; Cherry/Vanilla should; Caffeine-Free nice |
| Coca-Cola Mexican (glass, cane sugar) | Classic | 355ml, 500ml | must in LA-market liquor stores |
| Pepsi | Original, Zero Sugar, Diet, Wild Cherry | 12oz can, 20oz, 2L | Original/Zero must; Diet should; Wild Cherry should |
| Dr Pepper | Original, Zero, Diet, Cherry | 12oz can, 20oz, 2L | Original must; Zero/Diet should; Cherry nice |
| Shasta (value line, 21 items in old sheet) | Cola, Diet Cola + flavors across 1.2–1.4 | 12oz can, 2L, 3L | should as the value option; confirm with sales data |
| RC Cola | Original | 12oz can, 20oz | nice (value slot) |
| Jarritos / Mexican colas | see 1.3 Fruit & Mexican | | |

Open question: should Dr Pepper sit under Cola or its own "Pepper/spiced" subcategory? Proposal: keep under Cola for the cheat sheet; it competes for the same facings.

### 1.2 Lemon-lime

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Sprite | Original, Zero Sugar, Lymonade, Tropical Mix / seasonal | 12oz can, 20oz, 2L | Original must; Zero should; Lymonade/seasonal nice |
| Sprite Mexican (glass) | Original | 12oz, 500ml | should in LA market |
| 7UP | Original, Zero Sugar | 12oz can, 20oz, 2L | Original should; Zero nice |
| Starry (Pepsi) | Original, Zero | 12oz can, 20oz | nice |
| Mountain Dew (citrus, listed here or in 1.3, decide) | Original, Zero, Diet, Code Red, Baja Blast | 12oz can, 20oz, 2L | Original must; Zero/Code Red should; Baja Blast nice |

### 1.3 Citrus, fruit & Mexican sodas

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Fanta | Orange, Strawberry, Pineapple, Grape, Zero Orange | 12oz can, 20oz, 2L | Orange must; Strawberry/Pineapple should; Grape/Zero nice |
| Fanta Mexican (glass) | Orange, Pineapple, Strawberry | 12oz, 16.9oz | Orange should; others nice |
| Cactus Cooler | Orange-Pineapple | 20oz | should (SoCal staple, in old sheet) |
| Crush | Orange, Grape, Strawberry, Pineapple | 20oz, 2L | Orange should; others nice |
| Sunkist | Orange, Zero | 20oz, 2L | should |
| Squirt | Original, Zero | 12oz can, 20oz, 2L | must in LA market (paloma mixer) |
| Jarritos | Mandarin, Lime, Tamarind, Grapefruit, Pineapple, Fruit Punch, Guava, Mexican Cola | 12.5oz glass, 1.5L | Mandarin/Lime/Tamarind/Grapefruit must; others should |
| Sangría Señorial | Original | 12oz glass | should |
| Sidral Mundet | Apple | 12oz glass, 500ml | should |
| Mirinda / Fresca / Manzanita Sol | flavors TBD | 20oz, 2L | nice, confirm with sales data |

### 1.4 Root beer & cream

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| A&W | Root Beer, Zero, Cream Soda | 12oz can, 20oz, 2L | Root Beer must; Zero/Cream should |
| Barq's | Root Beer, Zero | 12oz can, 20oz | should |
| Mug | Root Beer, Zero | 20oz, 2L | nice |

### 1.5 Ginger ale & club soda / tonic (mixer overlap)

Decide whether these live in SCD or in department 5 (Mixers). Proposal: **Mixers**, since the liquor-store use case is cocktails, and ginger ale/tonic/club soda are bought together. Keep a cross-reference in the SCD section. Old sheet confirms Canada Dry Ginger Ale 20oz is stocked.

### SCD assortment guardrails (for the cheat sheet)

- Every store: at least one cola, one zero/diet cola, one lemon-lime, one orange, one root beer in 20oz single-serve, plus 2L for cola and lemon-lime.
- LA market: Mexican Coke, Squirt and the top 4 Jarritos flavors are must.
- Diet/zero variants are only listed where the brand actually markets one at scale; do not auto-generate diet for every line.

### Open questions for discussion

1. Size class boundaries: is 16oz can its own class or part of single?
2. Should the liquor cheat sheet include take-home multipacks (a retail 12-pack of cans a customer carries out), or only singles from the cooler plus 2L bottles? The old sheet shows Mercaso sells 24- and 35-count cases of 12oz cans, which are for stores selling loose cans, not retail 12-packs. Proposal: singles + 2L only for liquor; multipacks return for markets.
3. Priority by store size (small vs large liquor store) or one list for now? Proposal: one list, add a `store_size` dimension later if needed.
4. Where does Mountain Dew go: lemon-lime or citrus?

---

## 2. Water, energy, sports, juice, tea/coffee RTD — `pending`

## 3. Candy & snacks — `pending`

## 4. Tobacco accessories & lighters — `pending`

## 5. Ice, mixers, cups, bags — `pending`

## 6. Household & kitchen — `pending` (assortment)

## 7. Health & beauty — `pending` (assortment)

## 8. Grocery staples — `pending`
