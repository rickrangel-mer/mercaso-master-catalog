# Sales cross-check — liquor store, CA (Phase 2.5)

This compares the encoded liquor-store catalog against 12 months of Mercaso sales to California liquor stores, and proposes changes.

**Decision (Rick, 2026-09-29): every proposal accepted.** The 12-month share stays the main number, and the 90-day share is the fallback where an item launched, changed or was discontinued during the year. All rows were applied to `data/` the same day, and the eight departments moved to `agreed`. Where a row offered two options, the first was applied: Fresca was dropped (3.18), and Vitaminwater Power-C and Energy 20oz went to should, not must (5.2).

Data pulled 2026-09-29 from Athena. **Window: 2025-09-29 to 2026-09-28**, the trailing 12 months of orders that weren't cancelled. In that window, **1,993** CA liquor stores bought **14,980** SKUs; 13,471 of those SKUs are still active. No prices or revenue appear here.

**Discontinued and replaced items.** A SKU discontinued mid-year keeps its full-year share, and its replacement looks weak. For example, the Coca-Cola 1L was last ordered on 2026-04-04, and its replacement, a 24oz bottle, was first ordered on 2026-04-06. So this report matches only items that are ACTIVE in the item table. It also shows a **90-day share** (the last 90 days, against stores active then) wherever an item launched or was discontinued during the year. 90-day shares run lower than 12-month ones, since fewer stores buy any one SKU in three months, so compare them only with each other. Revised 2026-09-29 after Rick flagged the 1L.

## How to read the numbers

**Store share** is the percentage of those 1,993 stores that bought the SKU at least once in 12 months. It is the best single answer to "should every liquor store carry this?". It only means something next to the **category's reach**, the share of stores that buy anything in that Mercaso category:

| Mercaso category | Reach | | Mercaso category | Reach |
|---|---|---|---|---|
| Beverage (all) | 99% | | Cleaning & Laundry | 68% |
| Soda, Water, Sports & Energy | 95–96% | | Health & Medicine | 71% |
| Candy & Snacks (all) | 93% | | Personal Care | 60% |
| Ramen & Instant Noodles | 68% | | Store Supplies (bags) | 33% |
| Sauces & Condiments | 57% | | Cigarettes | 17% |
| Breakfast, Breads & Tortillas | 41% | | Cigars & Cigarillos | 11% |

Stores buy beverages and candy from Mercaso but get most tobacco, household and health-and-beauty goods elsewhere. So a SKU with 4% share can lead its category in cigarettes, while 4% in soda means almost nobody carries it.

**Thresholds used below.** In beverages and candy, the current `must` leaves reach a median of 33% of stores (soft drinks), 39% (other drinks) and 23% (candy and snacks). Proposals follow those levels:
- **Upgrade:** a `should` or `nice` leaf above about 30%.
- **Downgrade:** a `must` leaf below about 10%.

Outside those departments, a proposal compares the leaf with the leaders in its own category. Tobacco sales only rank lines against each other (section 7).

**Matching is rough.** A script matched sales titles to leaves by brand, variant words and size (`scripts/crosscheck/`). Every proposal below was checked against the raw titles. Where the script matched the wrong SKU, the numbers here are the correct ones.

## Rerun

```
pnpm athena:export liquor-sales liquor-reach   # sales by SKU and category reach, into data/raw/
pnpm athena:export products                    # item status, used to skip discontinued SKUs
pnpm crosscheck                                # writes data/raw/crosscheck/{leaves,unmatched,verify,discontinued}.csv
```

`leaves.csv` lists every carried leaf with its best-selling matched SKU. `unmatched.csv` lists SKUs bought by at least 5% of stores that match no leaf. `verify.csv` lists the top SKUs for each `verify` node. `discontinued.csv` lists SKUs bought by at least 5% of stores that are no longer active. All four are gitignored.

## Summary

- **The priorities hold up.** In soft drinks and candy, the `must` leaves outsell the `should` leaves about 2–3 to 1.
- **Sizes are missing.** 16oz cans sell in 20–60% of stores for Coca-Cola, Sprite, Dr Pepper, Pepsi and Squirt, and the catalog lists no 16oz for them. The Coca-Cola bottler replaced its 1L with a 24oz bottle in April 2026; Dr Pepper, Pepsi and Squirt still sell 1L. Arizona sells as **22oz** cans, not the 23.5oz the catalog lists, and in far more flavors.
- **Better data now answers the brand-level questions** the outline left open: Celsius, Sparkling Ice, Shasta, the energy slots, aloe and coconut water, and Mexican candy.
- **Most upgrades are in drinks,** where `nice` leaves sell almost as well as `should` ones: Vitaminwater, Monster, premium water, Clamato Picante, Calypso and Parrot (sections 4 and 5).
- **About a dozen downgrades or drops** cover weak zero-sugar sizes, Vero lollipops, XVL chips, and brand lines Mercaso barely sells (Mirinda, Fresca, Barq's, Schweppes, Seagram's).
- **Tobacco can't be confirmed from sales,** since only 17% of stores buy cigarettes from Mercaso. The encoded lines match the order of Mercaso's top sellers, with one addition (Marlboro Silver).

---

## 1. Missing sizes and variants

Top sellers whose brand is in the catalog but whose size or variant is not.

| # | Node | Sales evidence (store share) | Proposed | Decision |
|---|---|---|---|---|
| 1.1 | `scd.cola.coca-cola` sizes | Classic 16oz 59%, Zero 16oz 41%, Diet 16oz 40%, Cherry 16oz 25%. The 1L (39% for the year) is discontinued: last ordered 2026-04-04 and replaced by a 24oz bottle from 2026-04-06. Over 90 days, Classic 24oz reaches 19% and Diet 24oz 8% | Add `16oz-can`: Classic must, Zero and Diet should. Add a new `24oz` bottle size: Classic should, Diet nice. No 1L | yes |
| 1.2 | `scd.lemon-lime.sprite` sizes | 16oz can 40%. The 1L is discontinued (last ordered 2026-03-21); the 24oz that replaced it reaches 9% over 90 days | Add `16oz-can` (should) and `24oz` (nice) | yes |
| 1.3 | `scd.cola.dr-pepper` sizes | 16oz 40%, 1L 32% (both active and selling through September); 2L already 51% | Add `16oz-can` and `1l` at should | yes |
| 1.4 | `scd.cola.pepsi` sizes | 16oz 28%, 1L 24% | Add `16oz-can` and `1l` at should | yes |
| 1.5 | `scd.fruit-mexican.squirt` sizes | 1L 40%, 16oz 21% | Add `1l` (should) and `16oz-can` (nice) | yes |
| 1.6 | `drinks.tea-coffee.arizona` size | All 23.5oz leaves have no sales; the 22oz cans sell in 35–68% of stores | Replace `23-5oz-can` with a `22oz-can` size def (650 ml) | yes |
| 1.7 | `drinks.tea-coffee.arizona` variants | Green Tea 68%, Mucho Mango 64%, Watermelon 62%, Kiwi Strawberry 57%, Fruit Punch 52%, Rx Energy 44%, Grapeade 43%, Lemon Tea 42%, Raspberry 42%, Peach 40%, Orangeade 37%, Sweet Tea 36%, Blueberry White Tea 36%, Green Tea Cucumber 35%, Dragonfruit Mango 34%, Arnold Palmer Lite 32%, Lemonade 31% | Green Tea, Mucho Mango, Lemon Tea and Arnold Palmer stay must (Arnold Palmer sells mostly as Lite, 32%). Watermelon, Kiwi Strawberry and Fruit Punch go to must. Add Rx Energy, Peach, Orangeade and Sweet Tea at should; the rest should or nice as encoded. Pre-priced and non-pre-priced cases are case options on the match row (rule 3), not separate leaves | yes |
| 1.8 | `drinks.sports.electrolit` variants | Blue Raspberry 41%, Fruit Punch 39%, Berry Bliss 31%, Mango 29%, Jamaica 26% are not encoded; Lemon Lime (Cucumber-Lime) 42%, Strawberry Kiwi 41%, Grape 38% are | Add Blue Raspberry and Fruit Punch (should), Berry Bliss, Mango and Jamaica (nice) | yes |
| 1.9 | `drinks.sports.gatorade` | Fierce Grape 28oz 35%, Fierce Strawberry 28%, Fierce Green Apple 26%, Arctic Blitz 20%; 24oz Cool Blue 35%, Fruit Punch 30% | Add Fierce Grape (should) and the other three (nice); add a `24oz` size at nice | yes |
| 1.10 | `drinks.sports.vitaminwater` | The 32oz bottles (26–27% for the year) are discontinued; 28oz bottles replaced them in August 2026. Over 90 days: XXX 28oz 20%, Energy 19%, Power-C 15%, Refresh 11%. Elevate 20oz 26% is not encoded | Add a `28oz` size: XXX and Energy should, the rest nice. Add Elevate at nice | yes |
| 1.11 | `drinks.juice` Dole | Dole 100% Pineapple 8oz can 44%, 46oz 32%; no Dole line | Add brand line Dole Pineapple: 8oz should, 46oz nice | yes |
| 1.12 | `grocery.seasonings.tajin` | Fruit and Snack Seasoning 5oz 18%, Mini 0.35oz 27%; Clásico 14oz 2%, 4.23oz 1%. The "Fruit" in the outline is most likely this 5oz bottle, which is Clásico under its retail label | Treat the 5oz Fruit and Snack Seasoning as the Clásico 5oz leaf (must); add Mini 0.35oz at must | yes |
| 1.13 | `candy-snacks.cookies-cakes.hostess` | Cup Cake Chocolate 35%, Strawberry 17%, Orange 13%; Donettes Powdered 29%, Chocolate 28%, Crunch 22% | Cupcakes must as is (the matcher missed "Cup Cake"); add Donettes Powdered and Chocolate at should | yes |
| 1.14 | `candy-snacks.mexican-candy.lucas` | Baby Sweet Mango 24%, Baby Chamoy 21%; not encoded | Add Lucas Baby Mango and Baby Chamoy at should | yes |
| 1.15 | `candy-snacks.mexican-candy.indy` | Dedos 32%, Hormigas 18%, Paleta Marimba 18%; encoded as Chamoy and Tamarindo, which don't sell | Replace the variants with Dedos (must), Hormigas and Marimba (should) | yes |
| 1.16 | `candy-snacks.gummy-chewy.haribo` | Goldbears Share Size 5oz 29%, 4oz 17%, Sour Gold Bears 16% | Goldbears must stays; use the 5oz share size as its size | yes |
| 1.17 | `candy-snacks.salty-snacks` pork rinds | El Sabroso Cracklins with hot sauce 29%, Hot & Spicy 28% | Add El Sabroso (should) if pork rinds are in scope | yes |
| 1.18 | `candy-snacks.nuts-seeds` | Arachi Japanese Peanuts Hot 5.6oz 30%, 1.76oz 13%; the chili-lime peanut slot's best match is 8% | Add Arachi Hot at should; see 3.10 | yes |

## 2. Brands missing from the catalog

Brands bought by at least 12% of stores with no node at all. All are shelf-stable and in scope, unless noted.

| # | Brand | Sales evidence | Proposed | Decision |
|---|---|---|---|---|
| 2.1 | Peñafiel (sparkling mineral water) | Limonada 22%, Plain 22%, Naranjada 18% | Add under `drinks.water` at should | yes |
| 2.2 | Starbucks Doubleshot and Espresso & Cream | Espresso & Cream 22%, Doubleshot Vanilla 15%, Mocha 14% | Add Espresso & Cream at should, Doubleshot at nice | yes |
| 2.3 | Guayakí Yerba Mate | Enlighten Mint 25%, Bluephoria 22%, Revel Berry 17% | Add under `drinks.energy` at nice (store-dependent) | yes |
| 2.4 | NOS Energy | Original 16oz 19% | Add at nice | yes |
| 2.5 | Saratoga, Mountain Valley | Saratoga 28oz 19%; Mountain Valley 1L 19% | Add a premium-water slot at nice | yes |
| 2.6 | Faygo, Bundaberg | Faygo 23oz flavors 13–16%; Bundaberg Ginger Beer 17% | Bundaberg under ginger ale at nice; Faygo at nice | yes |
| 2.7 | V8, Tropicana | V8 11.5oz can 17%; Tropicana 32oz 12% | Nice, or leave out | yes |
| 2.8 | Chocolate bars: Almond Joy, Butterfinger, Nestlé Crunch, Milky Way | Singles reach 15–16% each | Add all four at should, single size | yes |
| 2.9 | Gummy and sour candy: AMOS Peelerz, Gushers, Sour Punch, Sour Strips | Peelerz Mango 27%; Gushers 21–22%; Sour Punch Straws 21%; Sour Strips 18–19% | Add at should: Peelerz Mango, Gushers, Sour Punch Straws; Sour Strips nice | yes |
| 2.10 | Abba-Zaba, Efrutti, Toxic Waste Slime Licker | 15%, 13%, 12% | Nice | yes |
| 2.11 | Barebells protein bars | Cookies & Cream 15% | Nice in `meat-snacks-bars` | yes |
| 2.12 | ACT II microwave popcorn | 14% | Nice | yes |
| 2.13 | Charcoal and fire: Carbonazo mesquite charcoal 16%, Kingsford 4lb 13%, Firemaster firewood 16%, Charcoal Master lighter fluid 14%, Gas One butane 15% | The slots exist. Kingsford sells; El Rey and Duraflame firewood and Kingsford lighter fluid don't | Charcoal hints: Kingsford, Carbonazo. Firewood hint: Firemaster. Lighter fluid hint: Charcoal Master. Gas One is a new nice slot | yes |
| 2.14 | LiFoam ice chest cooler | 28qt 16% | Nice, as a seasonal item. Applied as a `brand_hints` entry on the existing `mixers-bar.cups-disposables.foam-cooler` slot (should), so the cooler isn't listed twice | yes |
| 2.15 | Party cups (unbranded, 16oz 24-pack) | 21%, filed under Kitchen | Use as the match for `mixers-bar.cups-disposables.party-cup-16oz` (see 3.12) | yes |

## 3. Downgrades and drops

`must` leaves that sell weakly for their category, and lines that barely sell.

| # | Node | Now | Sales evidence | Proposed | Decision |
|---|---|---|---|---|---|
| 3.1 | `scd.cola.pepsi.zero-sugar` 12oz can, 2L | must | 12oz 1.5%, 2L none; 20oz 10% | Zero Sugar should; drop the 2L | yes |
| 3.2 | `scd.fruit-mexican.squirt.zero-sugar` 12oz can, 2L | must | 12oz 2.9%, 2L none; 20oz 15% | Zero Sugar should, 20oz only | yes |
| 3.3 | `scd.lemon-lime.mountain-dew.original.12oz-can` | must | 5.6%; the 20oz reaches 19% | Should | yes |
| 3.4 | `scd.root-beer-cream.a-and-w.root-beer.12oz-can` | must | 7.8%; the 20oz reaches 33% | Should; the 20oz stays must | yes |
| 3.5 | `scd.fruit-mexican.jarritos.grapefruit` | must | 370ml 8%, 1.5L 6% | Should | yes |
| 3.6 | `drinks.michelada.baja-micheladas` (all four) | must (department 5 decision) | The Styrofoam cups are gone: Original and Hot were archived in July 2026, and Pineapple is back to draft. An Original Mix plastic cup launched 2026-07-14 and reaches 3% over 90 days; Mango, the only other active cup, reaches 1%. The rim dips are active (Chamoy 7%, Mango Habanero 6%); Clamato Michelada Especial reaches 16% | Keep Original (now the plastic cup) at should; Mango nice; drop Hot and Pineapple. This reverses the encoding choice in the handoff | yes |
| 3.7 | `candy-snacks.mexican-candy.vero` Mango con chile and Elotes | must | Chili Lollipops Mango 40ct 8%, Elotes 8% | Should | yes |
| 3.8 | `candy-snacks.salty-snacks.frito-lay-xvl` (8 variants) | must and should | Best XVL is Funyuns Flamin' Hot at 6%; Cheetos Flamin' Hot, Doritos Nacho and Lay's XVL have no sales. The same flavors in 2.5–3.25oz bags reach 8–24% | Keep the XVL line at nice and rethink rule 4 ("Chips: xvl only") before Phase 4 | yes |
| 3.9 | `candy-snacks.meat-snacks-bars.jack-links.original` | must | Original 3.25oz 4%, 1oz 4%. Slim Jim Giant Original (must) reaches 13%, and the Snack Size 0.28oz Original, not encoded, reaches 20% | Jack Link's should; add Slim Jim Snack Size Original at must | yes |
| 3.10 | `candy-snacks.nuts-seeds.chili-lime-peanuts` | must | Best is Snak Club Hot & Spicy 8%; Arachi Hot 30% | Point the slot's `brand_hints` at Arachi and Snak Club; keep must | yes |
| 3.11 | `candy-snacks.gum-mints.tic-tac.orange` | must | 9%; Freshmint (also must) 1oz 17% | Orange should; Freshmint stays must | yes |
| 3.12 | `mixers-bar.cups-disposables.party-cup-16oz` | must | Unbranded 16oz party cups 21% (see 2.15) | Keep must; add the brand hint | yes |
| 3.13 | `mixers-bar.bar-tools` corkscrew, bottle opener, shot glass | must | Corkscrew openers 3–4%, shot glasses 1% | Keep must if they are counter essentials, since stores may source them elsewhere; otherwise should | yes |
| 3.14 | `health-beauty.medicine.energy-shot` | must | Mercaso files 5-Hour Energy under Beverage, so the script's department scope missed it. Extra Strength Berry reaches 6%, Regular Berry 4%; Lipovitan 1% | Keep must; drop Lipovitan from `brand_hints` | yes |
| 3.15 | `grocery.breakfast-pantry.tortillas` | must | Every tortilla brand is at 1–2.5% (Guerrero 2.3%, Calidad 2.4%, Mission 0.9%); stores likely buy fresh locally | Should | yes |
| 3.16 | `grocery.seasonings.mega.chamoy` | must | Mega Chamoy 33oz 4%, 12.5oz 3.6% | Should | yes |
| 3.17 | `scd.fruit-mexican.mirinda` | nice | 1% | Drop | yes |
| 3.18 | `scd.fruit-mexican.fresca` | nice | Toronja 3L 4%, 20oz 2% | Drop, or keep 3L only at nice | yes |
| 3.19 | `scd.root-beer-cream.barqs` | should | 0.4% | Drop | yes |
| 3.20 | `scd.ginger-ale-club-tonic.schweppes` | should | Ginger Ale 10oz 0.9%; Canada Dry Ginger Ale reaches 46% at 1L and 24% at 10oz | Nice. This settles the Schweppes question in the handoff | yes |
| 3.21 | `scd.ginger-ale-club-tonic.seagrams` | nice | No sales | Drop | yes |
| 3.22 | `scd.cola.shasta` Diet Cola, 3L | should | None sold | Drop Diet Cola and 3L (see 4.1) | yes |
| 3.23 | `candy-snacks.mexican-candy` Ravi, Lorena, Jovy (Revolcaditas) | should | Ravi Crazy 4–7%, Lorena Crayon 3–4%, Jovy under 7% | Nice | yes |
| 3.24 | `candy-snacks.mexican-candy.lucas.pelucas` | nice | No sales | Drop | yes |
| 3.25 | `candy-snacks.cookies-cakes.clover-hill` | should | No sales | Drop, or confirm Mercaso stocks it | yes |
| 3.26 | `drinks.juice.welchs` | should and nice | Welch's 16oz juices 7–9% | Nice | yes |

## 4. Nodes the outline left to sales data (`verify: sales`)

| # | Node | Now | Sales evidence | Proposed | Decision |
|---|---|---|---|---|---|
| 4.1 | `scd.cola.shasta` | should, colas only | 12oz cans: Cola 22%, Tiki Punch 21%, Grape 18%, Twist 16%, Orange 15%, Black Cherry 15%, Kiwi Strawberry 15%, Dr. Shasta 14%, Creme 14%, Root Beer 13%; Cola 2L 6% | Add the flavors above as 12oz-can variants: Cola and Tiki Punch should, the rest nice; drop Diet Cola and 3L | yes |
| 4.2 | `scd.fruit-mexican.mirinda` | nice | 1% | Drop (3.17) | yes |
| 4.3 | `scd.fruit-mexican.fresca` | nice | 2–4% | See 3.18 | yes |
| 4.4 | `scd.fruit-mexican.manzanita-sol` | nice | 2L 7%, 20oz 6%, 12oz 5% | Keep Apple at nice, as encoded | yes |
| 4.5 | `drinks.water.sparkling-ice` | should, 4 stand-ins | Kiwi Strawberry 8%, Black Raspberry 7%, Strawberry Watermelon 7%, Coco Pineapple 7%, Lemon Lime 6%, Black Cherry 6% | Top four: Kiwi Strawberry, Black Raspberry, Strawberry Watermelon, Coco Pineapple. Replace Cherry Limeade and Fruit Punch. At 6–8% the whole line fits nice better than should | yes |
| 4.6 | `drinks.energy.celsius` | should, flavors not named | Watermelon 35%, Wild Berry 30%, Mango Passionfruit 27%, Kiwi Guava 27%, Peach Mango Green Tea 25%, Grape Rush 25%. Pink Lemonade launched in February 2026 and already ranks fifth over 90 days (15%, against Watermelon's 21%) | Name variants: Watermelon and Wild Berry should; Mango Passionfruit, Peach Mango Green Tea, Pink Lemonade and Kiwi Guava nice | yes |
| 4.7 | `drinks.energy.ghost` | nice slot | Welch's Grape 23%, Strawbango 22%, Cherry Limeade 20%, Blue Raspberry 19% | Should, target 3–4 | yes |
| 4.8 | `drinks.energy.c4` | nice slot, placeholder 2–3 | Strawberry Watermelon Ice 18%, Jolly Rancher Watermelon 18%, Frozen Bombsicle 17%, Jolly Rancher Green Apple 16% | Should, target 3 | yes |
| 4.9 | `drinks.energy.bang` | nice slot | Peach Mango 12%, Blue Razz 12% | Nice, target 2 | yes |
| 4.10 | `drinks.energy.alani-nu` | should slot, placeholder 2–3 | Variety 18-pack 7%; singles 2–3% | Nice, target 1–2 | yes |
| 4.11 | `drinks.juice.calypso` | 2 must, 3 should, 3 nice | Ocean Blue 68%, Strawberry 55%, Original 55%, Triple Melon 49%, Kiwi 49%, Paradise Punch 44%, Island Wave 43%, Tropical Mango 39%, Southern Peach 38%. The 90-day order is the same; Dragon Breeze, new in July 2026, reaches 16% | Original must; Triple Melon, Paradise Punch should; add Island Wave at should | yes |
| 4.12 | `drinks.juice.visvita` | Original and Mango should | Original 16.9oz 36%, Mango 27%, Pomegranate 25% (not encoded), Pineapple 23%, 1.5L Original 22% | Original 16.9oz must; add Pomegranate at should | yes |
| 4.13 | `drinks.juice.okf` | Original and Mango should | Original 16.9oz 15%, 1.5L 12%; Mango 5% | Original should; Mango nice; Guava and Tamarindo drop (no sales) | yes |
| 4.14 | `drinks.juice.vita-coco` | should | Original 16.9oz 43%, Pineapple 15%; the 11.1oz is 9% | Original 16.9oz must; the rest as is | yes |
| 4.15 | `drinks.juice.parrot` | should | With Pulp 16.6oz 66%, 10.5oz 19%. The 100% Coconut Water 16.6oz (9%) was archived in August 2026; Pure Coconut Water 11.1oz is active (7%) | With Pulp 16.6oz must; resize the with-pulp leaves to 16.6oz and 10.5oz; the Original leaf keeps only the 11.1oz | yes |
| 4.16 | `candy-snacks.mexican-candy` | category | Leaders: Limon 7 32%, Indy Dedos 32%, Lucas Gusano 29%, Salsagheti 29%, De la Rosa Mazapan 28%, Pulparindots 28%, Lucas Baby Mango 24%, Muecas 23%, Pelonazo 20% | Limon 7 Salt & Lemon must; Pelonazo should; also 1.14, 1.15, 3.7, 3.23, 3.24 | yes |

## 5. Upgrades

Leaves that sell like the tier above them. In drinks, a `should` leaf above about 45% moves to `must`, and a `nice` leaf above about 30% moves to `should`. Upgrades for Calypso, Vita Coco, Parrot, Visvita and Mexican candy are in section 4.

| # | Node | Now | Store share | Proposed | Decision |
|---|---|---|---|---|---|
| 5.1 | `drinks.sports.vitaminwater` XXX 20oz | should | 60% | Must | yes |
| 5.2 | `drinks.sports.vitaminwater` Power-C, Energy, Focus, Refresh 20oz | nice | 57%, 54%, 51%, 46% | Should (Power-C and Energy could be must) | yes |
| 5.3 | `drinks.energy.monster` Lo-Carb 16oz | should | 52% | Must | yes |
| 5.4 | `drinks.energy.monster` Original 24oz, Ultra Zero 24oz | nice | 52%, 34% | Original 24oz must; Ultra Zero 24oz should | yes |
| 5.5 | `drinks.energy.monster` Zero Sugar 16oz | should | 45% | Must | yes |
| 5.6 | `drinks.energy.red-bull.original.16oz-can` | should | 45% | Must | yes |
| 5.7 | `scd.cola.dr-pepper.original.2l` | should | 51% | Must | yes |
| 5.8 | `scd.ginger-ale-club-tonic.canada-dry.ginger-ale.1l` | should | 46% | Must | yes |
| 5.9 | `drinks.water` Essentia 1L, Fiji 1L, Perrier 16.9oz | should | 48%, 48%, 46% | Must | yes |
| 5.10 | `drinks.water` Perrier Lime 16.9oz, Aquafina 1L, Evian 1L, San Pellegrino 25.4oz | nice | 46%, 43%, 38%, 34% | Should | yes |
| 5.11 | `drinks.juice.motts-clamato.picante` 16oz, 32oz | nice | 45%, 35% | Should. This revises the Clamato encoding choice in the handoff | yes |
| 5.12 | `drinks.sports.gatorade.lime-cucumber.28oz` | nice | 44% | Should | yes |
| 5.13 | `drinks.juice.langers` Pineapple, Cranberry, Mango | nice | 37%, 37%, 35% | Should; resize these three from 16oz to 15.2oz | yes |
| 5.14 | `candy-snacks.gum-mints.5-gum.peppermint-cobalt` | nice | 45% | Should; Spearmint Rain (should, 44%) is the same level | yes |
| 5.15 | `candy-snacks.gum-mints.extra.peppermint` | nice | 41%; Extra Mega Pack Spearmint 31% | Should | yes |
| 5.16 | `candy-snacks.gum-mints.hubba-bubba.bubble-tape` | nice | 32% | Should | yes |
| 5.17 | `candy-snacks.nuts-seeds.spitz.cracked-pepper` | nice | 36%; Spitz Flaming Hot Limón 26% | Should | yes |
| 5.18 | `candy-snacks.chocolate.hersheys.cookies-n-creme` | nice | 31% | Should | yes |

## 6. Stock checks (`verify: stock`)

Checked against the products export (22,862 active items).

| # | Node | Finding | Proposed | Decision |
|---|---|---|---|---|
| 6.1 | `grocery.seasonings.hot-sauce` sizes | Tapatío 5oz (36%) and 10oz (25%), Valentina 12.5oz (14%), El Yucateco 4oz (3%), Cholula 5oz (3%), Tabasco 2oz (2%) are all active. The encoded sizes match | Clear `verify`. Also Valentina 34oz is active (2%); Tapatío ramen bowls sell 12–21% (grocery, not hot sauce) | yes |
| 6.2 | `grocery.seasonings.tajin.chamoy` | Tajín Fruity Chamoy Sauce 15.38oz, active, 1% | Clear `verify`; nice | yes |
| 6.3 | `grocery.seasonings.mega` | Mega Chamoy Original 33oz and 12.5oz, active | Clear `verify`; see 3.16 | yes |
| 6.4 | `grocery.instant-meals.mac-cheese-cup` | Kraft Macaroni & Cheese Cups 2.05oz, active, 4% | Clear `verify` | yes |
| 6.5 | `grocery.dry-goods.flour-masa` | Maseca Corn Flour 4.4lb, active, 6% | Clear `verify` | yes |
| 6.6 | `tobacco.lighters.clipper` | Only a 96-count Clipper display is active, with no sales. Bic (7%), King (6%) and Bic Mini (5%) lead | Nice | yes |
| 6.7 | `tobacco.*` categories | Active items: cigarettes 195, cigars 103, nicotine pouches 58, vapes 41, rolling accessories 511, smokeless 21 | See section 7 | yes |
| 6.8 | Guerrero tortillas (open item) | 49 active Guerrero items; corn tortillas reach about 2%, above Mission (0.9%), the slot's only hint | Add Guerrero to `grocery.breakfast-pantry.tortillas` `brand_hints`; no separate line. Closes the open item | yes |

## 7. Tobacco (lines 4.1–4.4)

Mercaso reaches 17% of stores for cigarettes, 11% for cigars and 10% for pouches. Stores buy most tobacco from licensed distributors, so sales can't confirm must or should. They can only rank lines within Mercaso's share. The encoded order matches that ranking:

| Line | Mercaso's top sellers (store share) | Encoded | Proposed | Decision |
|---|---|---|---|---|
| Cigarettes | Marlboro Gold 9.7%, Red 8.8%, Gold 100s 7.8%, Red 100s 7.6%, Seneca 100s 6.7%, American Spirit Blue 6.6%, Marlboro Silver 6.3%, American Spirit Yellow 5.9% | Marlboro Red and Gold should; Red 100s nice; American Spirit should; value slot must | Marlboro Red 100s should (it sells like King); add Marlboro Silver at nice; add Seneca to the value slot's hints | yes |
| Cigars | Swisher Classic 4.3%, Black & Mild Original 4.1%, Clipper cigarillos 2.2%, Swisher Regular 2.0%, Silver 1.8%, Diamond 1.6%, Backwoods 1.2% | Swisher Original and Diamond, Backwoods and Black & Mild must | Leave as is; the ranking agrees | yes |
| Pouches | Zyn Smooth 6mg 7.3%, Original 6mg 5.4%, Smooth 3mg 5.0%, Original 3mg 3.9%; Lucy and Velo under 1% | Settled 2026-09-29 | No change; the data agrees | yes |
| Smokeless | Copenhagen Snuff and Long Cut at 1%; Skoal at 0.4% | Copenhagen Long Cut should | No change | yes |
| Papers and wraps | Zig-Zag Orange 4.5%, Grabba Leaf 4.2%, Raw Classic 3.5%, Raw Cones 3.0% | Zig-Zag Orange and Raw Classic must; blunt-wrap slot should | Add Grabba Leaf to the blunt-wrap slot's `brand_hints` | yes |

Lines 4.1–4.4 remain market-knowledge drafts until someone checks store shelves.

## 8. Limits of this pass

- **The script is a screening tool, not the Phase 4 matcher.** Candy, chip and tobacco leaves carry no volume, so it matches them at the variant level. Assortment slots without `brand_hints` don't match at all (bar tools, sponges, pads, bags); those were checked by hand.
- **Store share undercounts items stores get elsewhere,** as the reach table shows. For household, health and beauty, and grocery, a low share is not evidence that stores skip the item.
- **The period is one year,** so seasonal items (charcoal, coolers) count once, and a limited edition sells for only part of it. Red Bull's seasonal editions (Peach 20%, Summer 8–9% over 90 days) are left out on purpose.
- **Only active items are matched.** An item archived since the export ran, or one Mercaso plans to drop, still counts. Recheck the discontinued list before applying changes: `data/raw/crosscheck/discontinued.csv`.
