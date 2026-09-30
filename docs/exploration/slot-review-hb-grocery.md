# Assortment slot review — health & beauty and grocery (liquor store, CA)

The same review as `assortment-slot-review.md` (household and mixers), now for the two remaining assortment departments: health & beauty (40 slots) and grocery (43 slots plus the Tajín, chamoy and hot-sauce brand lines).

Data: Mercaso sales to the 1,993 active CA liquor stores, 2025-09-29 to 2026-09-28, active items only. The 12-month store share is the main number and the 90-day share the fallback (Rick, 2026-09-29).

**Two kinds of change.**
- **Applied in this PR (part A):** suggested brands, notes and match fixes, where sales leave no real choice. New matches are added as *proposed* (hand-added, status `auto`) so Rick approves them like any other pending match.
- **Proposed (part B):** priority and item-count changes, drops and new slots. **Rick accepted all 25 on 2026-09-30, and they are applied in `data/`.** The products each new slot cites were approved as its matches.

## How far Mercaso reaches here

Share of the 1,993 stores that bought anything in each Mercaso sub-category in 12 months:

| Health & beauty | Reach | | Grocery | Reach |
|---|---|---|---|---|
| Medicine | 63% | | Ramen & instant noodles | 68% |
| Oral care | 41% | | Sauces (hot sauce) | 52% |
| Eyecare & lipcare | 38% | | Spices & seasoning (Tajín) | 43% |
| Sexual health | 33% | | Peppers, pickles & olives | 42% |
| Deodorants & perfumes | 31% | | Breakfast (Pop-Tarts, cereal cups) | 36% |
| Hair care | 31% | | Condiments & dressings | 32% |
| Soap & body wash | 31% | | Lemon & lime juice | 30% |
| Sanitizers & disinfectants | 29% | | Non-beverage coffee | 29% |
| **Baby wipes** | 27% | | Sugar & syrup | 28% |
| Feminine care | 25% | | Cooking oils | 27% |
| Shaving | 21% | | Canned meat & chili | 24% |
| Skin care | 21% | | Salt & pepper | 22% |
| Beauty & cosmetics | 21% | | Canned seafood | 20% |
| First aid & bandages | 14% | | Canned beans, soups, rice | 16% each |
| Vitamins & supplements | 10% | | Baking soda | 16% |
| | | | Vinegar | 15% |
| | | | Pet food | 43% |
| | | | Pet supplies (cat litter) | 11% |

Bold, and the lemon & lime juice, coffee, baking soda, vinegar and cat litter rows: sub-categories with real reach and no slot in the catalog today (part B).

## A. Applied in this PR

| Slot | Evidence (12-month store share) | Change |
|---|---|---|
| `health-beauty.first-aid.cotton-swabs` | Its two approved "matches" were Faygo Cotton Candy soda and Bang Cotton Candy energy drink; they slipped through the bulk approval. Q-Tips 170ct 4.3% | **Both rejected.** Brand Q-Tips, match terms "cotton swab", "q-tips"; Q-Tips 170ct proposed |
| `health-beauty.medicine.pain-reliever` | Tylenol Extra Strength 50ct 13.5%, the top seller, was not matched (the slot said 2-packs only); Advil PM 2ct 7.1% | Note allows a small bottle; Tylenol 50ct proposed |
| `health-beauty.first-aid.eye-drops` | Visine 15.4% but only 1.0% in 90 days; Pure Eyes 11.7%, 8.3% in 90 days; Clear Eyes 8.9% | Adds Pure Eyes (proposed); note on the shift |
| `health-beauty.personal-care.body-wash` ("Body wash / hand soap") | Lucky hand soap 3.0%, Softsoap 2.1%; body wash under 1% | Match terms add "hand soap"; brands Lucky, Softsoap, Dove; Lucky hand soap proposed |
| `health-beauty.personal-care.bar-soap` | Dove 7.9%, Irish Spring 3.0%; Zest not sold | Zest replaced by Irish Spring |
| `health-beauty.personal-care.shampoo` | VO5 4.5%, Head & Shoulders 2.8% | VO5 first |
| `health-beauty.feminine-family.condoms` | Trojan Ultra Thin 17.6%, Magnum 17.6%, ENZ 12.7%, Her Pleasure 12.7%, Bareskin 12.6%, Ultra Ribbed 11.9% | Note lists the leaders |
| `health-beauty.feminine-family.pregnancy-test` | Paraid 3.3% | Brand Paraid |
| `grocery.instant-meals.canned-soup` | Campbell's Chicken Noodle 6.5%, Juanita's Menudo 5.5% | Brands Campbell's, Juanita's, Maggi; Menudo proposed |
| `grocery.seasonings.mayo` | Best Foods 8oz 7.1%, 15oz 7.1%; McCormick 1.7% | Best Foods first; both proposed |
| `grocery.seasonings.ketchup` | Del Monte 7.5%, Hunt's 6.1%, Heinz 3.1% | Del Monte, Hunt's, Heinz |
| `grocery.canned-jarred.pickles` | Van Holten's Big Papa 22.7%, Hot Mama 21.0% | Note: single pouch, the two leaders |
| `grocery.canned-jarred.tuna` | Chicken of the Sea 2.5%, StarKist 2.2%; Bumble Bee not sold | StarKist, Chicken of the Sea |
| `grocery.canned-jarred.sardines-oysters` | California Girl oysters 5.7%, Crown Prince 3.3%, Beach Cliff 2.8% | California Girl, Crown Prince, Beach Cliff |
| `grocery.canned-jarred.canned-vegetables` | Del Monte corn 5.5%; mixed vegetables 1.7% | Corn proposed |
| `grocery.canned-jarred.canned-fruit` | Dole pineapple chunks 3.3%; Del Monte fruit cocktail 0.8% | Pineapple proposed |
| `grocery.dry-goods.cooking-oil` | 1-2-3 1L 13.4%, Mazola corn oil 8.4% | 1-2-3 first |

Rick approved these 9 matches with the review (2026-09-30).

## B. Proposals for Rick

| # | Slot | Now | Evidence (12-month store share) | Proposed | Decision |
|---|---|---|---|---|---|
| **Health & beauty** | | | | | |
| B.1 | `health-beauty.first-aid.eye-drops` | should, 1 item | Visine 15%, Pure Eyes 12%, Clear Eyes 9%; eyecare reaches 38% | Must, 1–2 items | yes |
| B.2 | `health-beauty.medicine.cough-drops` | 1 item | Four Halls flavors at 17–22% (Honey Lemon, Extra Strong, Coolwave, Cherry) | 2 items | yes |
| B.3 | `health-beauty.feminine-family.condoms` | 2 items | Six Trojan lines at 12–18% | 2–3 items | yes |
| B.4 | `health-beauty.personal-care.body-spray` | nice | Ten Axe scents at 3–6% | Should | yes |
| B.5 | `health-beauty.feminine-family.tampons` | should | Tampax 1.5% | Nice | yes |
| B.6 | `health-beauty.beauty-accessories.nail-clipper` | should | Best 2.2%, still pending | Nice | yes |
| B.7 | `health-beauty.beauty-accessories.hair-accessories` | should | Scrunchies and bobby pins 0.1% or less; Genco pocket hair brush 3.0% | Rename to "Comb / hair brush" at nice, brand Genco | yes |
| B.8 | Drop slots with no sales | nice | Face masks 0%; lubricant (K-Y) 0.6%, not Trojan | Drop `first-aid.face-masks` and `feminine-family.lubricant` | yes |
| B.9 | New slot: baby wipes | — | Huggies 48ct 11.1% (5.2% in 90 days), Huggies 56ct 5.4%; baby wipes reach 27% | Add `feminine-family.baby-wipes` at should, brand Huggies | yes |
| B.10 | New slot: breath strips | — | Listerine Pocket Fresh Cool Mint 9.9% (5.8% in 90 days), Freshburst 3.7% | Add `oral-lip.breath-strips` at should, brand Listerine | yes |
| **Grocery** | | | | | |
| B.11 | `grocery.breakfast-pantry.toaster-pastry` | should, 1 item | Pop-Tarts Strawberry 18.4%, Cherry 14.5%, Blueberry 13.4%, Chocolate Chip 11.8% | Must, 2 items | yes |
| B.12 | `grocery.canned-jarred.pickles` | should, 1 item | Van Holten's 21–23%; eight pouches above 4%; pickles & peppers reach 42% | Must, 2 items | yes |
| B.13 | `grocery.instant-meals.vienna-sausage` | should | Libby's 14.5% | Must | yes |
| B.14 | `grocery.dry-goods.cooking-oil` | should | 1-2-3 13.4% and 11.4%, Mazola 8.4%; oils reach 27% | Must | yes |
| B.15 | `grocery.instant-meals.ramen-cup` | must, 3–4 items | Fourteen cups at 20–32% (Samyang Buldak, Maruchan Instant Lunch, Nongshim bowls, Tapatio) | 4–6 items | yes |
| B.16 | `grocery.dry-goods.flour-masa` | nice | Maseca 6.2% | Should | yes |
| B.17 | Downgrades to nice | should | Pepper 0.6%; mustard 1.8%; seasoning blend 1.4% (Knorr bouillon 2.1%); dry beans 0.5% (dry beans reach 3%) | `seasonings.pepper`, `mustard`, `seasoning-blend`, `dry-goods.dry-beans` to nice | yes |
| B.18 | Pet food up | nice | Pedigree dry 17.9%, Pedigree wet 9.5%, 9 Lives wet cat 8.2%; pet food reaches 43% | `pet.dog-food-dry`, `dog-food-wet`, `cat-food-wet` to should | yes |
| B.19 | New slots: cat litter, dry cat food | — | Jonny Cat 5lb 8.0%; Meow Mix 3.15lb 5.8% | Add `pet.cat-litter` at should and `pet.cat-food-dry` at nice | yes |
| B.20 | New slot: instant coffee (and creamer) | — | Nescafé Clásico 50g 11.0%, 100g 10.5%, Dolca 8.3%; Folgers 4.6%; creamer N'Joy 4.2%, Coffee-mate 3.4%; reach 29% | Add `breakfast-pantry.instant-coffee` at should (Nescafé, Folgers) and `coffee-creamer` at nice | yes |
| B.21 | New slot: lemon & lime juice | — | ReaLemon 2.5oz 10.9%, ReaLime 2.5oz 9.7%, 8oz 9.2%, California Wedge 7.5%; reach 30%. A drink mixer as much as a grocery item | Add `seasonings.lemon-lime-juice` at should (ReaLemon, ReaLime, California Wedge), linked from mixers | yes |
| B.22 | New slot: beer salt | — | Twang Lime 4.1%, Lemon-Lime 3.7% | Add `seasonings.beer-salt` at nice, brand Twang, linked from mixers | yes |
| B.23 | New slot: baking soda | — | Arm & Hammer 16oz 9.6%, 8oz 8.1% | Add `dry-goods.baking-soda` at should | yes |
| B.24 | New slot: vinegar | — | Heinz white 16oz 9.9%, cider 4.1% | Add `dry-goods.vinegar` at should | yes |
| B.25 | New slot: dried shrimp | — | Lupag dried shrimp 5.9%, whole shrimp 3.8% (a botana with beer) | Add `seasonings.dried-shrimp` at nice | yes |

Unchanged, and confirmed by sales: the must slots for antacid (Tums 22%), cough drops (Halls 22%), cold & flu, energy shots, toothpaste, toothbrush, lip balm, bar soap, deodorant, razor, pads, bandages, ramen packets, sugar, beans and jalapeños, and the Tajín and hot-sauce lines. Also left as they are: slots whose best seller is 1–5% but that a store still needs one of (shampoo, lotion, rice, tortillas, tuna).

Seen but not proposed: Michelada cups from Fiesta (4.4%) belong to the drinks department, not here; Sriracha (3.2%) and Kraft BBQ sauce (3.1%) are below the bar for a new branded line; Baja Micheladas rim dips are already covered by the rimming slot.
