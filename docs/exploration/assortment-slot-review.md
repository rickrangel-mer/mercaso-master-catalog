# Assortment slot review — cleaning, laundry, paper, tableware (liquor store, CA)

The Phase 2.5 sales cross-check matched sales to branded items well, but mostly failed to match assortment slots, the generic "carry one or two of these" items used for household goods. This review goes slot by slot through two departments: household (cleaning, laundry, paper, air care, equipment) and mixers and bar (cups and disposables, bags, bar tools).

It uses the same data as the cross-check. Window: 2025-09-29 to 2026-09-28, active items only, 12-month store share as the main number and 90-day share as the fallback (Rick, 2026-09-29).

**Two kinds of change.**
- **Applied in this PR (part A):** suggested brands, slot names and item counts, where sales leave no real choice. These are the brands and sizes stores already buy from Mercaso.
- **Proposed (part B):** priority changes, drops and new slots. **Rick accepted all 25 on 2026-09-29, and they are applied in `data/`.**

## How far Mercaso reaches here

The share of the 1,993 stores that bought anything in each Mercaso sub-category from Mercaso in 12 months (`pnpm athena:export liquor-reach` now reports sub-categories too):

| Sub-category | Reach | | Sub-category | Reach |
|---|---|---|---|---|
| Disposable tableware | 61% | | Picnic supplies (coolers, shot cups) | 31% |
| Cleaning solutions | 61% | | Candles & incense | 30% |
| Charcoal, gas & lighters | 58% | | Trash & food bags | 29% |
| Laundry detergents & soaps | 54% | | Motor oil & fluids | 25% |
| Toilet paper | 49% | | Air fresheners | 22% |
| Paper towels & napkins | 43% | | Auto cleaning & lubricants | 22% |
| Fabric softeners | 39% | | Cleaning equipment | 20% |
| Store supplies (bags) | 33% | | Pest control | 16% |

Most stores buy these categories from Mercaso, but spread across many items, so a single item rarely tops 20%. Here, an item bought by 10% or more of stores is a leader.

## A. Applied in this PR

| Slot | Top sellers (12-month store share) | Change |
|---|---|---|
| `household.cleaning.multipurpose-cleaner` | LA's Totally Awesome All Purpose 24oz 14%, 32oz 11%; Fabuloso 16.9oz 9%; Pinalen 3% | Brands in sales order: LA's Totally Awesome, Fabuloso, Pinalen |
| `household.cleaning.bleach` | Clorox 11oz 19%, LA's Totally Awesome 96oz 16%, Clorox 24oz 14%, Cloralen 16.9oz 13%, Clorox 43oz 13% | Brands Clorox, Cloralen, LA's Totally Awesome; 2 items |
| `household.cleaning.dish-soap` | Palmolive 12.6oz 14%, Ajax 12.4oz 9%, Dawn 14.6oz 8% | Adds Dawn |
| `household.cleaning.scouring-powder` | Ajax 21oz 9%, Comet 28oz 3% | Ajax first |
| `household.cleaning.shoe-polish` | El Oso 0.7%; Nugget not stocked | Brand El Oso |
| `household.laundry.detergent-liquid` | Tide 25oz 26%, Gain 25oz 21%, Gain 10oz 19%, Tide 10oz 17%; Ace 1.5% | Tide, Gain, Ariel (Ace removed) |
| `household.laundry.detergent-powder` | Ariel Oxi Azul 500g 13%, Tide 218g 12%, Roma 500g 9% | Adds Tide; 1–2 items |
| `household.laundry.fabric-softener` | Suavitel 450ml 17% and 13%, Downy 10oz 13%, Downy 360ml 12% | Suavitel, Downy; 2 items (Ensueño removed, no sales) |
| `household.laundry.dryer-sheets` | Bounce 10%, Gain 9%, Suavitel 6% | Adds Suavitel |
| `household.laundry.stain-remover` | Soilove 16oz 12%, Tide To Go 2% | Soilove, Tide To Go |
| `household.paper.toilet-paper` | Melody 4-pack 26%, Virtue 15%, Scott 1000 13%, Melody 425 12% | Melody first |
| `household.paper.paper-towels` | Melody 19%, Virtue 12%, Jubilee 8%, Bounty 5% | Melody, Virtue, Jubilee, Bounty (Del Rey removed) |
| `household.paper.napkins` | Melody 180ct 15%, Soft Touch 4% | Brands Melody, Soft Touch |
| `household.paper.facial-tissue` | Kleenex 2%; Puffs and Softeen not sold | Brand Kleenex |
| `household.paper.aluminum-foil` | Reynolds 25 sq ft 5%, Premier 4% | Reynolds, Premier |
| `household.paper.aluminum-pans` | Eco Foil steam-table pans 1% | Brand Eco Foil |
| `household.air-candles-pest.air-freshener-spray` | Febreze 2–3% | Febreze, Glade |
| `household.air-candles-pest.air-freshener-small` | Little Trees car fresheners 5%, Wizard 2% | Renamed "Air freshener, car or small"; Little Trees first |
| `household.air-candles-pest.scented-candle` | Wizard 3oz 0.7% | Brand Wizard |
| `household.air-candles-pest.incense` | Nag Champa 6% | Brand Nag Champa |
| `household.air-candles-pest.pest-control` | Raid Ant & Roach 17.5oz, four scents 4–6% | Brand Raid |
| `household.equipment-home.sponges` | Scotch-Brite scrub sponge 4%, Chore Boy copper 4% | Scotch-Brite, Chore Boy |
| `mixers-bar.bar-tools.rimming-tray` | Baja Micheladas rim dips: Chamoy 7%, Mango Habanero 6%, Tamarindo 6% | Renamed "Michelada rim dip / rimming salt"; brand Baja Micheladas |
| `mixers-bar.cups-disposables.party-cup-16oz` | Red 16oz party cups 21%, Ultimate Home 11%, assorted 6% | Ultimate Home, Cool Party Cups, Imperial |
| `mixers-bar.cups-disposables.shot-glass-1oz` | Red plastic 2oz shot cups 10%, clear 1oz 3% | Renamed "Plastic shot cup (1–2oz)"; unbranded |
| `mixers-bar.cups-disposables.foam-cup-12oz` | Axxion 16oz 13%, 12oz 12%, 20oz 5% | Renamed "Foam cup 12–16oz"; Axxion; 1–2 items |
| `mixers-bar.cups-disposables.plates-9in` | Axxion foam 8⅞" 10%, 10¼" 10%; Blue Star paper 10" 5% | Renamed "Plates 9–10", foam or paper"; Axxion, Blue Star; 1–2 items |
| `mixers-bar.cups-disposables.foam-bowls` | Axxion 30oz 6%, 12oz 3% | Brand Axxion |
| `mixers-bar.cups-disposables.plastic-forks`, `plastic-spoons` | Blue Star forks 8%, spoons 9% | Blue Star, Heavy Duty Cutlery |
| `mixers-bar.cups-disposables.foam-cooler` | LiFoam 28qt 16%, Ariana 24-can 10% | Adds Ariana |
| `mixers-bar.store-bags.kraft-bag-2lb`, `kraft-bag-4lb` | Daisy #2 11%, Daisy #4 6%, Duro 2lb 3% | Daisy, Duro |
| `mixers-bar.trash-storage-bags.trash-30gal` | Sure-Tuff 26gal 5%, Ri-Pac 30gal 4%, Riptie 33gal 3% | Renamed "Large trash bag 26–33gal"; those three brands |
| `mixers-bar.trash-storage-bags.zipper-bags` | Glad 0.9%, Ri-Pac 0.8% | Glad, Ri-Pac |

## B. Proposals for Rick

| # | Slot | Now | Evidence (12-month store share) | Proposed | Decision |
|---|---|---|---|---|---|
| B.1 | `household.laundry.fabric-softener` | should | Suavitel 17%, Downy 13%; fabric softeners reach 39% | Must | yes |
| B.2 | `household.laundry.laundry-bar-soap` | must | Zote 14.1oz 4%, 7oz 2% | Should | yes |
| B.3 | `household.laundry.dryer-sheets` | nice | Bounce 10%, Gain 9% | Should | yes |
| B.4 | `household.laundry.stain-remover` | nice | Soilove 12% | Should | yes |
| B.5 | `household.cleaning.glass-cleaner` | nice | Windex 500ml 10% | Should | yes |
| B.6 | `household.cleaning.scouring-powder` | nice | Ajax 9% | Should | yes |
| B.7 | `household.cleaning.toilet-bowl-cleaner` | should | Best is Lysol 32oz at 1.6% | Nice | yes |
| B.8 | `household.cleaning.disinfecting-wipes` | should | Clorox wipes 2.8% | Nice | yes |
| B.9 | `household.paper.napkins` | should | Melody 180ct 15%, on a par with the bleach and detergent leaders | Must | yes |
| B.10 | `household.air-candles-pest.air-freshener-spray` | should | Febreze under 3% | Nice | yes |
| B.11 | `household.air-candles-pest.air-freshener-small` | nice | Little Trees 5%; air fresheners reach 22% | Should | yes |
| B.12 | `household.air-candles-pest.incense` | nice | Nag Champa 6% | Should | yes |
| B.13 | `household.equipment-home.latex-gloves` | should | No glove above 2% (work gloves 1.8%) | Nice | yes |
| B.14 | `household.equipment-home.chargers-cables` (USB-C, Lightning, wall block) | should | All under 1%; stores likely buy phone accessories elsewhere | Nice | yes |
| B.15 | `mixers-bar.cups-disposables.foam-cup-12oz` | should | Axxion 16oz 13%, 12oz 12% | Must | yes |
| B.16 | `mixers-bar.cups-disposables.foam-bowls` | nice | Axxion 30oz 6% | Should | yes |
| B.17 | `mixers-bar.bar-tools.rimming-tray` | nice | Baja rim dips 6–7% | Should | yes |
| B.18 | `mixers-bar.store-bags.reusable-bag` | nice | Reusable "Thank You" 13×7×21 bag 6.5% | Should | yes |
| B.19 | `mixers-bar.trash-storage-bags.zipper-bags` | should | Under 1% | Nice | yes |
| B.20 | Drop slots with no sales and no Mercaso stock | nice | Plastic wrap 0.3%, spray bottle 0.1%, plunger 0.2%, shower curtain 0.1%, bath mat none; flask and jigger not stocked | Drop `household.paper.plastic-wrap`, `household.equipment-home.spray-bottle`, `plunger`, `bath-mat`, `shower-curtain`, `mixers-bar.bar-tools.flask`, `jigger` | yes |
| B.21 | New slot: cocktail jug | — | Mixed Cocktail Jug 1 gal 11% (7% over 90 days), 2 gal 5% | Add `mixers-bar.cups-disposables.cocktail-jug` at should | yes |
| B.22 | New category: automotive | — | Motor oil & fluids reach 25% and auto cleaning 22%. Chevron Supreme 10W-30 7%, 10W-40 7%; STP power steering fluid 7%; Little Trees covered by B.11 | Add `household.auto` with a motor-oil slot (should, 2 items, Chevron, Pennzoil) and an auto-fluids slot (nice: power steering, brake, antifreeze, washer fluid; STP, Peak, LA's Totally Awesome) | yes |
| B.23 | New slot: super glue | — | Krazy Glue 12% | Add `household.equipment-home.super-glue` at should | yes |
| B.24 | New slots: party and gifts | — | Wine-bottle gift bags 5%, party balloons 6%, birthday candles 3% | Add wine gift bag (should) and balloons and birthday candles (nice) under `mixers-bar.cups-disposables` | yes |
| B.25 | New slot: six-pack rings | — | Plastic rings for 6-pack cans, 1000ct, 4% | Add `mixers-bar.store-bags.six-pack-rings` at nice | yes |

Unchanged, and confirmed by sales: the `must` slots for multipurpose cleaner, bleach, dish soap, liquid and powder detergent, toilet paper, paper towels, religious candles, sponges, batteries, party cups, shot cups, bottle bags and 13gal trash bags. The charcoal, firewood and butane slots were settled in the cross-check.

## Automotive is liquor-store demand, not gas stations

Rick asked whether B.22 mixes in gas stations or convenience stores. It doesn't. The data covers only stores labeled "Liquor store", and the labels hold up. By store type, 12 months, CA:

| Store type | Active stores | Buy motor oil | Buy car-care items | Gas-station-like names |
|---|---|---|---|---|
| Liquor store | 1,993 | 25% (493) | 22% | 4 |
| Gas station | 627 | 43% | 48% | 423 |
| Market / grocery | 719 | 22% | 20% | 3 |
| Convenience store | 392 | 15% | 20% | 6 |

Gas-station-like names are store names matching words such as gas, fuel, Chevron, Arco or 76. Only 1 of the 493 liquor stores that buy motor oil has one. A future gas-station catalog should weight automotive more heavily.

## Not covered yet

Health and beauty and grocery slots get the same review next. The slot matching in `scripts/crosscheck/` still can't place slots on its own; this review matched them by keyword in a one-off script. Phase 4's matcher should use the suggested brands set here.
