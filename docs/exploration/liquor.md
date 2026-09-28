# Liquor store — exploration outline

Working document for Phase 0. One section per department. Each section states whether the department is **branded** (brand → variant → size leaves) or **assortment** (coverage slots mapped to many SKUs), then lists the proposed tree. Priority levels: **must** (every store), **should** (most stores), **nice** (upside, store-dependent).

Status legend per department: `draft` (proposed, not discussed) · `discussed` (edited with Rick) · `agreed`.

Alcohol, beer and wine are out of scope.

## Department order

1. Soft drinks (SCD) — draft below
2. Water, energy, sports, juice, tea/coffee RTD — draft below
3. Candy & snacks — draft below
4. Tobacco accessories & lighters — pending
5. Ice, mixers, cups, bags — pending
6. Household & kitchen — pending (assortment)
7. Health & beauty — pending (assortment)
8. Grocery staples — pending (mostly assortment)

Before drafting 2 onward, review the prior attempt (see `prior-attempt.md`) and carry forward what holds up.

---

## 1. Soft drinks (SCD) — `discussed`

Kind: **branded**. Leaves are brand line → variant → size.

Size classes (agreed). Sizes are the **retail unit the store shelves** (12oz can, 20oz bottle). Case pack is not part of the catalog: the match row picks one Mercaso case SKU per leaf, and only where a real scenario exists (e.g. Coke 24-pack vs 35-pack) does a leaf carry more than one case option.
- `single` — 12oz can, 16oz can, 16.9oz/500ml bottle, 20oz bottle (grab and go, cold box)
- `take_home` — 1L, 1.25L, 2L, 3L

No multipack class for liquor stores. Sizes the old sheet confirms Mercaso stocks for soda: 12oz can, 16oz, 16.9oz, 20oz, 1L, 2L.

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
| Mountain Dew | Original, Zero, Diet, Code Red, Baja Blast | 12oz can, 20oz, 2L | Original must; Zero/Code Red should; Baja Blast nice |

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

### 1.5 Ginger ale, club soda & tonic (agreed: stays in SCD)

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Canada Dry | Ginger Ale, Zero, Club Soda, Tonic | 12oz can, 20oz, 1L, 2L | Ginger Ale 20oz must; Club Soda/Tonic 1L must (mixers); Zero nice |
| Schweppes | Ginger Ale, Club Soda, Tonic | 1L, 2L | should |
| Seagram's | Ginger Ale | 20oz, 2L | nice |

Department 5 (Mixers) will cross-reference these rather than duplicate them.

### SCD assortment guardrails (for the cheat sheet)

- Store-size: one priority list for all liquor stores (agreed). No small/large split.

- Every store: at least one cola, one zero/diet cola, one lemon-lime, one orange, one root beer in 20oz single-serve, plus 2L for cola and lemon-lime.
- LA market: Mexican Coke, Squirt and the top 4 Jarritos flavors are must.
- Diet/zero variants are only listed where the brand actually markets one at scale; do not auto-generate diet for every line.

### Decisions log

- Leaf = retail unit; pack size is not a catalog dimension (Rick, 2026-09-28).
- 16oz can folds into `single` (assumed, not objected to).
- One priority list, no store-size split.
- Mountain Dew under Lemon-lime.
- Ginger ale, club soda, tonic stay in SCD.

---

## 2. Water, energy, sports, juice, RTD tea & coffee — `draft`

Kind: **branded** throughout. Brands below are the ones Mercaso stocks per the old sheet; sizes are retail units. Single-serve is the liquor-store core; 1L/1.5L for water only.

### 2.1 Water

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Arrowhead | Spring, Sports cap | 16.9oz, 1L, 1.5L, 1gal | 16.9oz/1L must; 1gal should |
| Aquafina | — | 16.9oz, 20oz, 1L, 1.5L | 20oz should |
| Dasani | — | 16.9oz, 20oz, 1L, 1.5L | 20oz should |
| Niagara / Crystal Geyser (value) | — | 16.9oz, 1gal | one value line must |
| Smartwater | Original, Alkaline | 20oz, 1L, 1.5L | 1L must; 20oz should |
| Essentia | — | 20oz, 1L, 1.5L | should |
| Core | — | 20oz, 30.4oz | nice |
| Fiji | — | 500ml, 1L, 1.5L | 1L should |
| Evian | — | 500ml, 1L | nice |
| Topo Chico (sparkling) | Original, Twist of Lime | 12oz glass | must (LA market, mixer) |
| Perrier | Original, Lime, Strawberry, Orange | 11.15oz glass, 500ml | Original should |
| San Pellegrino | — | 500ml, 25.4oz | nice |
| Sparkling Ice | Black Cherry, Cherry Limeade, Kiwi Strawberry, Fruit Punch, Lemonade, others | 17oz | 3–4 top flavors should |
| Liquid Death | Still, Sparkling | 16.9oz can | nice |

Guardrail: one value still water, one premium still (Smartwater or Fiji), one sparkling (Topo Chico) in every store.

### 2.2 Energy

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Red Bull | Original, Sugar Free, Red/Yellow/Green Editions | 8.4oz, 12oz, 16oz, 20oz | 8.4oz + 12oz Original must; Sugar Free must; Editions should |
| Monster | Original, Zero Sugar, Ultra Zero, Lo-Carb, Rehab | 16oz, 24oz | Original + Ultra Zero must; Lo-Carb/Zero should; 24oz nice |
| Rockstar | Original, Sugar Free | 16oz | should |
| Bang | top 4–5 flavors | 16oz | nice |
| Ghost | top 3–4 flavors | 16oz | nice |
| Celsius / Alani (not in old sheet, confirm stocked) | — | 12oz | nice, check sales data |

### 2.3 Sports & electrolytes

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Gatorade | Fruit Punch, Cool Blue, Lemon Lime, Orange, Glacier Freeze, Glacier Cherry, Lime Cucumber | 20oz, 28oz | Fruit Punch/Cool Blue/Lemon Lime/Orange 20oz must; Glacier Freeze should; 28oz should |
| Powerade | Mountain Berry Blast, Fruit Punch, Lemon Lime, Orange, Grape, White Cherry | 20oz, 28oz | Mountain Berry Blast + Fruit Punch should; rest nice |
| Electrolit | Strawberry, Orange Mandarin, Coconut, Grape, Lemon Lime, Strawberry Kiwi | 21oz | Strawberry/Coconut/Orange must (LA market); rest should |
| Vitaminwater | XXX, Focus, Energy, Power-C, Refresh, Essential | 20oz | XXX + 2 others should |

### 2.4 Juice, nectars & punch

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Jumex | Mango, Guava, Strawberry-Banana, Peach, Coconut Pineapple | 16oz can, 1L | Mango/Guava must; others should |
| Kern's | Mango, Guava, Peach, Strawberry Banana, Apricot | 11.5oz can, 23oz | Mango/Guava/Peach should |
| Calypso | Lemonade, Strawberry Lemonade, Ocean Blue, Southern Peach, Kiwi, Tropical Mango, Triple Melon, Paradise Punch | 16oz glass | Strawberry Lemonade + Ocean Blue must; 2–3 more should |
| Minute Maid | Lemonade, Pink Lemonade, Apple, Cranberry Grape | 12oz can, 20oz, 2L | Lemonade 20oz must; Pink Lemonade should |
| Welch's | Grape, Apple, Orange, Cranberry, Strawberry Kiwi, Mango Passion | 16.9oz | Grape + Apple should |
| Langers | Orange, Apple, Mango, Pineapple, Cranberry, Fruit Punch | 16oz | Orange + Apple should (value) |
| Ocean Spray | Cranberry, Cran-Grape | 15.2oz, 32oz | Cranberry 15.2oz should (mixer) |
| Mott's Clamato | Original, Picante, Preparado | 10oz, 16oz, 32oz, 64oz | 16oz + 32oz must (michelada) |
| Sunny D | Tangy Original, Orange Tangerine | 16oz, 40oz, 64oz | 16oz nice |
| Dole | Orange, Apple | 15.2oz | nice |
| Martinelli's | Apple Juice, Sparkling Cider | 10oz glass, 8.4oz | Apple 10oz should |
| Visvita / OKF (aloe) | Original, Mango, Strawberry, Pineapple, Coconut, Guava, Tamarindo | 16.9oz, 1.5L | Original + Mango should; one aloe brand only |
| Vita Coco / Parrot (coconut water) | Original, Pineapple / with Pulp | 11.5oz, 16.9oz | one coconut water should |

### 2.5 RTD tea, coffee & dairy drinks

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Arizona | Green Tea Ginseng Honey, Mucho Mango, Lemon Tea, Raspberry Tea, Kiwi Strawberry, Fruit Punch, Watermelon, Grapeade, Arnold Palmer | 23.5oz can | Green Tea + Mucho Mango + Lemon Tea + Arnold Palmer must; rest should |
| Snapple | Peach Tea, Lemon Tea, Diet Peach Tea, Kiwi Strawberry, Mango Madness, Apple, Pink Lemonade | 16oz | Peach Tea + Lemon Tea should |
| Lipton | Brisk Lemon Tea, Brisk Raspberry, Pure Leaf Sweet, Pure Leaf Unsweetened, Pure Leaf Lemon | 1L (Brisk), 18.5oz (Pure Leaf) | Brisk Lemon 1L should; Pure Leaf Sweet + Unsweetened should |
| Starbucks Frappuccino | Vanilla, Mocha, Caramel, Coffee | 9.5oz, 13.7oz | Vanilla + Mocha 13.7oz should |
| Nesquik | Chocolate, Strawberry, Vanilla | 14oz | Chocolate should |

### 2.6 Michelada mixes

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Baja Micheladas (cup) | Original, Mango, Hot, Pineapple | 24oz cup | Original + Hot should (LA market) |
| Clamato | see 2.4 | | |

### Open questions

1. Energy drinks are a top-velocity category for liquor stores. Confirm Celsius, Alani Nu, C4, Prime are stocked by Mercaso; the old sheet has none of them.
2. Aloe and coconut water: one brand each, or list both stocked brands? Proposal: one slot each, brand chosen in matching by velocity.
3. Arizona 23.5oz is a "99¢" price-point item. Do we want price-point as an attribute anywhere? Proposal: no, not in v1.

---

## 3. Candy & snacks — `draft`

Kind: **branded**, but with a lighter tree than beverages. Leaf = brand line → variant (flavor) → size class (`single` = standard bar/bag, `king` = king/share size, `peg` = peg bag 4–5oz). No 12oz/2L logic here. Candy priority reflects LA liquor-store checkout counters: chocolate bars, gum, Mexican candy and peg-bag gummies.

### 3.1 Chocolate bars

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Snickers | Original, Almond, White | single, king | Original single + king must; Almond should |
| Reese's | Peanut Butter Cups, King, Big Cup, Sticks | single, king | Cups single + king must |
| M&M's | Milk Chocolate, Peanut, Peanut Butter | single, king | Peanut + Milk must |
| Kit Kat | Original, King | single, king | single must |
| Hershey's | Milk Chocolate, Almond, Cookies 'n' Creme | single, king | Milk single must; Almond should |
| Twix | Original | single, king | single must |
| Pay Day | Original | single, king | should |
| Kinder Joy | — | single | should |
| Ferrero Rocher | 3-count | single | nice |

### 3.2 Gum & mints

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Trident | Spearmint, Original, Tropical Twist, Bubblegum | 14ct | Spearmint + Original must |
| Extra | Spearmint, Peppermint, Polar Ice | 15ct | Spearmint + Polar Ice must |
| Orbit | Spearmint, Peppermint, Wintermint | 14ct | Spearmint should |
| 5 Gum | Spearmint Rain, Peppermint Cobalt, Watermelon | 15ct | Spearmint Rain should |
| Wrigley's | Doublemint, Juicy Fruit, Big Red, Spearmint | 5-stick / 15-stick | Doublemint + Juicy Fruit should |
| Eclipse / Dentyne | Spearmint, Winterfresh | — | one of the two nice |
| Hubba Bubba | Bubble Tape, Max Original | — | Tape nice |
| Ice Breakers | Cool Mint, Spearmint mints; Ice Cubes gum | 1.5oz tin / 40pc | mints Cool Mint must; Ice Cubes should |
| Tic Tac | Orange, Freshmint, Fruit Adventure | single | Orange + Freshmint must |
| Altoids | Peppermint, Wintergreen | tin | Peppermint should |
| Mentos | Mint, Fruit, Rainbow | roll | Mint + Fruit should |

### 3.3 Gummy, chewy & sour (peg bags)

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Haribo | Gold Bears, Sour Gold Bears, Happy Cola, Twin Snakes | peg | Gold Bears must; 2 more should |
| Trolli | Sour Brite Crawlers, Sour Brite Eggs, Watermelon Sharks | peg | Crawlers must |
| Sour Patch Kids | Original, Watermelon | peg | Original must |
| Skittles | Original, Sour, Wild Berry | single, king | Original must; Sour should |
| Starburst | Original, FaveReds | single, king | Original must |
| Airheads | Assorted, Xtremes | single | should |
| Now & Later | Original, Extreme Sour | single | should (LA market staple) |
| Hi-Chew | Original mix, Mango, Strawberry | peg, single | Original mix should |
| Warheads | Extreme Sour, Sour Twists | peg | nice |
| Mike & Ike / Sour Power / Rips / Red Vines | — | peg | 1–2 of these nice |
| Life Savers | Gummies Five Flavor, Wild Berry | peg | should |
| Nerds | Gummy Clusters, Rope | peg / single | Clusters must (high velocity) |
| Snak Club | Sour Worms, Gummy Bears, Apple Rings | 4oz | value peg-bag line, should |

### 3.4 Hard candy & lollipops

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Jolly Rancher | Original hard, Sour | peg | Original should |
| Charms Blow Pop | Assorted | single | must (checkout) |
| Pop Rocks | Strawberry, Cherry, Watermelon | single | nice |
| Lemonhead / Ferrara | Original, Chewy | single | nice |

### 3.5 Mexican candy

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Lucas | Muecas, Gusano, Bomvaso, Salsagheti, Pelucas | single | Muecas + Gusano + Salsagheti must |
| De la Rosa | Mazapán, Pulparindo, Pulparindots | single | Mazapán + Pulparindo must |
| Pelon | Pelo Rico, Pelonetes, Pelonazo | single | Pelo Rico must |
| Vero | Mango con Chile, Elotes, Rebanaditas | single | Mango + Elotes must |
| Jovy | Revolcaditas, Ricas Mango | single | should |
| Limón 7 | Salt & Lemon powder | single | should |
| Indy / Hola / Ravi / Lorena / Pica | — | single | 1–2 nice, choose by velocity |

### 3.6 Salty snacks (chips, corn, popcorn)

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Frito-Lay XVL / big bags | Cheetos Flamin' Hot, Cheetos Xxtra Flamin' Hot, Cheetos Crunchy, Doritos Nacho, Doritos Dinamita, Fritos Turbos Flamas, Funyuns Flamin' Hot, Munchies Flamin' Hot, Lay's Classic, Ruffles Cheddar | 2.5–3.5oz XVL, 1oz single | Cheetos Flamin' Hot + Doritos Nacho + Lay's Classic must; the rest should |
| Takis | Fuego, Blue Heat | 4oz, 9.9oz | Fuego 4oz must |
| Pringles | Original, Sour Cream & Onion, Cheddar, BBQ | 1.3oz, 2.5oz | Original + SC&O 2.5oz should |
| Cheez-It | Original, Extra Cheesy, Hot & Spicy | 3oz | Original should |
| Chex Mix | Traditional, Cheddar, Bold | 3.75oz | Traditional nice |
| Kettle | Sea Salt, Salt & Vinegar | 2oz | nice |
| El Sabroso / California Snack Foods (value) | — | 3oz | nice |

### 3.7 Nuts & seeds

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| David | Original, Ranch, BBQ, Dill Pickle | 5.25oz | Original + Ranch must |
| Spitz | Original, Cracked Pepper, BBQ | 6oz | nice |
| Corn Nuts | Original, Ranch, Chili Picante, BBQ | 1.7oz, 4oz | Original + Ranch should |
| Planters | Salted, Heat | 1.5–1.75oz | Salted should |
| Blue Diamond | Smokehouse, Wasabi Soy, Roasted Salted | 1.5oz | Smokehouse should |
| Wonderful Pistachios | Roasted Salted, Sweet Chili | 1.25oz | Roasted Salted should |
| Arachi / Manzela (Japanese peanuts) | Natural, Hot | single, 6.3oz | one brand must (LA market) |
| Snak Club / Muncheros / Tapatio (chili-lime) | Chili Lemon peanuts, Tajín seeds | 5oz | one chili-lime peanut must |
| Beer Nuts | Peanuts, Cashews | 2–4oz | nice |

### 3.8 Meat snacks & bars

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Jack Link's | Original, Teriyaki, Peppered jerky; Beef & Cheese sticks | 1oz, 1.25oz, 3.25oz | Original 3.25oz + 1oz must; Teriyaki should |
| Slim Jim | Giant Original, Monster Original, Monster Tabasco | single | Giant must; Monster should |
| Clif Bar | Chocolate Chip, Crunchy PB, Chocolate Brownie | 2.4oz | Chocolate Chip should |
| Kind / Nature Valley | top 2 | single | one bar brand nice |
| Power Crunch / Prime Bites | protein | single | nice |

### 3.9 Cookies, crackers & snack cakes

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Oreo | Original, Double Stuf, Mini | 6ct, king 4oz, 3oz mini | Original 6ct + king must |
| Chips Ahoy | Original king, Mini | king, 3oz | king should |
| Grandma's | Peanut Butter, Mini Sandwich Cremes | 2.5oz | should |
| Keebler | Cheese & PB sandwich crackers, Club & Cheddar, Vanilla wafers | 1.8oz | sandwich crackers should |
| Ritz | Cheese sandwich, Original | 1.35oz | nice |
| Gamesa | Marías, Barra de Coco | 4.9oz | Marías should (LA market) |
| Bauducco / Lil' Dutch Maid | wafers, creme cookies | 5–12oz | nice, value shelf |
| Pocky / Hello Panda / Yan Yan | Chocolate, Strawberry | single | Pocky Chocolate + Strawberry nice |
| Rice Krispies Treats | Original | 2.2oz | should |
| Lenny & Larry's | Chocolate Chip, PB | 4oz | nice |
| Hostess | Honey Bun, Twinkies, Cupcakes, Zingers, Ding Dongs | single | Honey Bun + Twinkies + Cupcakes must |
| Bon Appetit | Danish, Concha, Banana Bread, Muffin | single | Concha + Danish should (LA market) |
| Dolly Madison / Ne-Mo's / Moon Pie / Clover Hill | mini donuts, cakes, Big Texas cinnamon roll | single | Big Texas should; others nice |
| Welch's Fruit Snacks | Mixed Fruit | 2.25oz | should |
| Nutella & Go | — | single | nice |

### Candy & snacks guardrails

- Checkout counter: 6 chocolate bars, 4 gums, 2 mints, Blow Pops, 4 Mexican candies minimum.
- Peg-bag wall: Haribo, Trolli, Sour Patch, Nerds Clusters, one value line.
- Chip rack: 3 Flamin' Hot items, Doritos, Lay's, Takis. Flamin' Hot dominates LA velocity.
- Beer-adjacent: David seeds, Japanese peanuts, chili-lime peanuts, jerky, Slim Jim, Clamato.

### Open questions

1. Size classes for candy: is `single / king / peg` enough, or do we need `theater box` and `share bag`?
2. Chips: XVL (2.5–3.5oz) vs 1oz single-serve; does a liquor store carry both? Proposal: XVL must, 1oz nice.
3. Mexican candy brand list is long and low-value per item; do we cap at the top 5 brands?

## 4. Tobacco accessories & lighters — `pending`

## 5. Ice, mixers, cups, bags — `pending`

## 6. Household & kitchen — `pending` (assortment)

## 7. Health & beauty — `pending` (assortment)

## 8. Grocery staples — `pending`
