# Laundromat — catalog outline

Started 2026-10-20. The second store type after liquor stores (`docs/PLAN.md`). Unlike liquor, there was no outline to start from: this draft is built from what CA laundromats buy from Mercaso, and Rick reviews it. Member discounts for laundromats come later (Rick, 2026-10-20).

Status: **draft**, encoded and matched, waiting for Rick's review.

## What laundromats buy

- 382 laundromats on record; **230 ordered from Mercaso in the last 12 months**, 173 in the last 90 days. 47 are members.
- By value, **laundry is two thirds of what they buy** (66%), drinks 18%, cleaning and janitorial 9%, snacks 6%.
- The laundry they buy is **single-load and small packs to sell or vend**: 10oz Gain and Tide bottles, 250–500g Ariel, Tide, Roma and Foca powder, 450ml Suavitel and 360ml Downy softener, 15–20 count dryer sheets, 11oz Clorox, 16oz Soilove. Shoppers ask for these by brand; the top items reach 50–79% of laundromats.
- Some buy bulk for wash-and-fold (Roma and Foca 10kg, Suavitel 8.5L, Downy 2.6–2.8L), 5–10% of them each.
- Drinks and snacks are for the vending machine: mostly 12oz cans, 16.9oz water, 20oz Gatorade, 22oz Arizona, and 1–2oz chip bags in 50–64 count cases or club-store variety packs.

## Scope (Rick, 2026-10-20)

| In | Out |
|---|---|
| Customer laundry (sold at the counter or vended) | Store operating supplies: janitorial, restroom paper, trash bags, gloves |
| Wash-and-fold bulk | |
| Vending drinks and snacks | |

Same as liquor: no alcohol, nothing chilled or frozen.

## How it is modeled

- **Laundry is a new branded department** (`data/taxonomy/departments/laundry.yaml`): brand → scent → size, like soft drinks (Rick: branded, not slots). Six categories: liquid detergent, powder detergent, fabric softener, dryer sheets, bleach/stain removers/laundry soap, and a laundry-bag slot. The liquor store type keeps its own small laundry shelf (`household.laundry`) and does not include this department.
- **Size classes:** `single_load` (sold one load at a time: 8–13.5oz bottles, 218–250g bags, 15–20 count sheets), `retail` (a few loads: 16oz–46oz, 350g–1.5kg) and `bulk` (wash-and-fold: 64oz and up, 5–10kg).
- **Product type in the brand line name** where one brand spans categories ("Tide Powder", "Gain Fabric Softener", "Suavitel Dryer Sheets", "Clorox Bleach"), so the matcher keeps detergent, softener and sheets apart.
- **Vending reuses the liquor tree.** The store type includes the exact leaves laundromats buy (the Coca-Cola 12oz can, not every Coca-Cola size). A few laundromat-only nodes were added to the shared departments and are excluded from the liquor store type, so the liquor catalog is unchanged (still 1,047 items):
  - a 1–2oz vending bag for seven Frito-Lay chips and Takis Fuego, and a chip variety-pack slot;
  - Famous Amos and Knott's shortbread (2oz), and Grandma's Mini Sandwich Cremes 3.71oz;
  - the Coca-Cola Classic 16.9oz bottle (11% of laundromats).
- **Supply hold:** the Arizona 22oz items carry the same supply hold as for liquor stores.

## Priorities

Drafted from the share of the 230 laundromats that bought the item from Mercaso in 12 months, counting any approved SKU of the item (the same per-item logic as the liquor work):

| Priority | Share of laundromats |
|---|---|
| must | 30% or more |
| should | 10–30% |
| nice | 3–10% |
| not carried | under 3% |

Where the 90-day share is under half or over double the 12-month share (fading, discontinued or new), the 90-day share decides. Each line of `data/store-types/laundromat.yaml` shows the 12-month and 90-day share behind it.

**Result: 188 items, 26 must, 52 should, 110 nice.**

| Department | Must | Should | Nice |
|---|---|---|---|
| Laundry | 25 | 27 | 59 |
| Soft drinks | 1 | 10 | 11 |
| Water, energy, sports, juice, tea & coffee | 0 | 11 | 24 |
| Candy & snacks | 0 | 4 | 16 |

The must list (12-month / 90-day share):

| Item | 12 mo | 90 days |
|---|---|---|
| Fabric softener › Suavitel › Fresca Primavera › 450ml | 79% | 77% |
| Bleach & stain › Soilove › 16oz | 73% | 71% |
| Fabric softener › Downy › Aroma Floral › 360ml | 70% | 65% |
| Liquid detergent › Gain › Original › 10oz | 68% | 65% |
| Bleach & stain › Clorox Bleach › 11oz | 67% | 67% |
| Powder detergent › Ariel › Original › 250g | 59% | 50% |
| Fabric softener › Suavitel › Aroma de Sol › 450ml | 58% | 54% |
| Bleach & stain › Cloralen › 16.9oz | 58% | 52% |
| Dryer sheets › Bounce › Outdoor Fresh › 15ct | 55% | 52% |
| Liquid detergent › Tide Simply › Clean & Fresh › 10oz | 54% | 45% |
| Dryer sheets › Gain › Original › 15ct | 49% | 46% |
| Fabric softener › Downy › April Fresh › 10oz | 47% | 38% |
| Powder detergent › Ariel › Oxi Azul › 500g | 45% | 32% |
| Powder detergent › Tide › Original › 218g | 45% | 39% |
| Coca-Cola Classic 12oz can | 42% | 39% |
| Dryer sheets › Suavitel › Lavender › 18ct | 41% | 34% |
| Liquid detergent › Gain › Original › 25oz | 40% | 40% |
| Dryer sheets › Suavitel › Fresca Primavera › 20ct | 40% | 29% |
| Liquid detergent › Tide Simply › Oxi › 10oz | 38% | 28% |
| Powder detergent › Ariel › Original › 500g | 37% | 22% |
| Powder detergent › Tide › with Downy › 350g | 37% | 27% |
| Liquid detergent › Tide › Original › 25oz | 35% | 34% |
| Liquid detergent › Tide › Original › 10oz | 34% | 35% |
| Dryer sheets › Suavitel › Aroma de Sol › 18ct | 32% | 27% |
| Liquid detergent › Tide Simply › Daybreak Fresh › 25oz | 30% | 25% |
| Powder detergent › Roma › Original › 500g | 30% | 22% |

Only one vending item reaches must: no single drink or snack is bought by 30% of laundromats, while laundry items reach 79%.

## Matching

`pnpm match laundromat` proposed SKUs, and every proposal was reviewed in this session (reviewer `claude`; Rick can reject any):

- **77 approved liquor matches carried over** for the vending leaves (note "Approved for liquor"), plus the case packs laundromats buy that liquor stores don't (Sprite 24-pack, Dr Pepper and Pepsi 36-packs, Coca-Cola 35-pack).
- **Wrong proposals rejected**, 16 still on carried items (Grapefruit Zazz for Grape, Tide Pods for liquid Tide, dryer sheets for liquid Downy, and so on).
- **21 SKUs hand-added (`manual`)** where the matcher could not see them, mostly because they are archived (below).
- Every one of the 188 items has an approved SKU. That holds by construction: the catalog was built from what Mercaso sells, so it finds no sourcing gaps (see open question 4).

## Findings for Rick

1. **Top laundromat SKUs are ARCHIVED in the item master but still ordered this month.** The matcher only proposes active items, so these were added by hand with a note. If they are being replaced, the replacement SKUs should go on the same items.

   | SKU | Product | Laundromats, 12 mo |
   |---|---|---|
   | JC00470 | Gain Original 10oz | 68% |
   | DW137560-12 | Tide Simply Clean & Fresh 10oz | 54% |
   | JC26748 | Downy April Fresh 10oz | 47% |
   | VS066138 | Tide Simply +Oxi 10oz | 38% |
   | JC778289 | Tide with Downy powder 350g | 37% |
   | DW67800-12 | Tide Original 10oz | 34% |
   | DW67780-12, JC86624, JC59926 | Suavitel 850ml (Fresca Primavera, Aroma de Sol, Anochecer) | 27%, 20%, 8% |
   | JC104112 | Downy Cool Cotton 10oz | 11% |
   | VS005841, JC25631 | Laundry bags | 4% each |

   Archived items also have no price in the pricing export, so the site shows no price or margin for them.
2. **Downy Aroma Floral, large bottle:** the 800ml SKUs reached 31% of laundromats in 12 months but have not sold since July. The active 700ml SKU (VS019625) is matched but has no laundromat sales yet. The item is should until it does.
3. **Arizona 22oz** is fading here too: it carries the liquor supply hold, and five Arizona flavors fell under 3% in the last 90 days.

## Open questions for Rick

1. **Thresholds.** Are must ≥ 30%, should 10–30%, nice 3–10% right for laundromats? They give 25 laundry musts and one vending must.
2. **Archived SKUs** (finding 1): are they being replaced, and by what?
3. **Laundromat-only additions in shared departments** (vending chip bags, Famous Amos, Knott's, Coca-Cola 16.9oz): liquor excludes them for now. Should liquor stores carry any?
4. **Products laundromats commonly sell that Mercaso doesn't**, to review as sourcing gaps. None are in the catalog, because it was built from Mercaso's sales. Candidates from general laundromat assortments: Purex, Arm & Hammer and Xtra liquid detergent, Snuggle softener, OxiClean, Downy Unstopables beads, and single-load vend boxes beyond Tide's 1.1oz.

## Refreshing

```
pnpm athena:export laundromat-sales products pricing
pnpm match laundromat     # keeps every reviewed row; proposes for new or reopened items
pnpm build                # dist/laundromat.json
pnpm web:html             # the site has a store-type switcher (liquor opens first)
```

`pnpm review export laundromat` and `pnpm gaps laundromat` write the review sheets and gap report, as for liquor.
