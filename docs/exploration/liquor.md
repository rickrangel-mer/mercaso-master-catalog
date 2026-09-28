# Liquor store — exploration outline

Working document for Phase 0. One section per department. Each section states whether the department is **branded** (brand → variant → size leaves) or **assortment** (coverage slots mapped to many SKUs), then lists the proposed tree. Priority levels: **must** (every store), **should** (most stores), **nice** (upside, store-dependent).

Status legend per department: `draft` (proposed, not discussed) · `discussed` (edited with Rick) · `agreed`.

Alcohol, beer and wine are out of scope. Tobacco is in scope (Mercaso sells it now).

## Department order

1. Soft drinks (SCD) — draft below
2. Water, energy, sports, juice, tea/coffee RTD — discussed
3. Candy & snacks — discussed
4. Tobacco & accessories — discussed
5. Mixers, bar tools, cups, bags — discussed
6. Household & kitchen — discussed (assortment)
7. Health & beauty — discussed (assortment)
8. Grocery staples — discussed (mostly assortment)

Prior attempt reviewed (see `prior-attempt.md`). All eight departments are `discussed`.

Phase 0 is closed. The sales cross-check against Athena is deferred to **Phase 2.5** (after the catalog is encoded, before the UI); departments move to `agreed` after it. See "Sales cross-check" below.

## Modeling rules (agreed during exploration)

1. Tree: Store type → Department → Category → Subcategory → leaf. Department names reuse the old sheet's.
2. Two leaf kinds. **Branded** (brand line → variant → size) where the brand is the recommendation: beverages, candy, snacks, tobacco, hot sauce, Tajín/Chamoy. **Assortment** (slot with `target_count`, `mix`, `size_class`) where coverage is the recommendation: household, health & beauty, grocery, cups, bags, bar tools.
3. Leaf sizes are retail units. Case pack is not a catalog dimension; the match row carries it. A leaf holds more than one case option only when a real scenario exists (Coke 24 vs 35 count).
4. Size classes are defined per subcategory, not globally. Soda: `single` (12oz, 16oz, 16.9oz, 20oz) and `take_home` (1L–3L); no multipacks for liquor. Candy: `single` / `king` / `peg` where they apply. Chips: `xvl` only. Assortment: `small` / `regular` / `bulk`.
5. Mix vocabulary for assortment slots: `value`, `national`, `hispanic`.
6. Priority: `must` / `should` / `nice`, one list per store type, no store-size split. Inherits down the tree unless overridden.
7. Variants listed only where the brand markets them at scale; no auto-generated diet/zero.
8. Scope for liquor v1: no alcohol, beer, wine; no chilled or frozen; no packaged ice; no bread or Mission tortillas; no male enhancement; no Auto, Apparel, Baby, Office, Toys, Promo, Store Supplies departments. Pet is `nice` only. Tobacco is in scope. Store operating supplies (bags) stay under a labeled node.
9. Age-restricted items carry `age_restricted: true`; CA-restricted variants (menthol, flavored tobacco) carry `restricted: CA`.
10. Cross-references (mixers) point at the canonical node; nothing is duplicated in two places.

## Sales cross-check (Phase 2.5)

Query Athena for liquor-store customers, trailing 12 months: units and revenue by Mercaso category and by item. Compare against this outline:
- Items in the top N by velocity that map to no node → candidate additions, reviewed with Rick.
- Nodes marked `must` with negligible sales → candidate downgrades.
- Brand-level sanity for aloe, coconut water, Mexican candy, energy drinks, where the outline defers to data.
Output: `docs/exploration/sales-crosscheck.md` with the two lists and a decision column. Requires Athena access (table names, credentials) from the data team.

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
- 16oz can folds into `single` (Rick confirmed, 2026-09-28).
- One priority list, no store-size split.
- Mountain Dew under Lemon-lime.
- Ginger ale, club soda, tonic stay in SCD.

---

## 2. Water, energy, sports, juice, RTD tea & coffee — `discussed`

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
| Celsius | Original top flavors, Essentials | 12oz, 16oz | should (fast mover, rank by data) |
| Alani Nu | top flavors | 12oz | should |
| C4 | top flavors | 16oz | nice |

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
| Visvita / OKF (aloe) | Original, Mango, Strawberry, Pineapple, Coconut, Guava, Tamarindo | 16.9oz, 1.5L | Original + Mango should; brand decided by sales data |
| Vita Coco / Parrot (coconut water) | Original, Pineapple / with Pulp | 11.5oz, 16.9oz | should; brand decided by sales data |

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

### Decisions log

- Mercaso stocks Celsius, Alani Nu and C4; Prime is not stocked and is left out (Rick, 2026-09-28).
- Aloe and coconut water: both stocked brands listed; which one leads is decided by sales data in Phase 2.
- Price-point (99¢ items) is not an attribute in v1 (assumed, not objected to).

---

## 3. Candy & snacks — `discussed`

Kind: **branded**, but with a lighter tree than beverages. Leaf = brand line → variant (flavor) → size class. Size classes are **defined per subcategory**, not globally: chocolate bars and chewy singles use `single` / `king`; gummies use `peg`; gum and mints use their pack count; chips use `xvl` only; nuts, jerky, cookies and snack cakes use the retail unit (e.g. 5.25oz, 3.25oz, 6ct). No 12oz/2L logic here. Candy priority reflects LA liquor-store checkout counters: chocolate bars, gum, Mexican candy and peg-bag gummies.

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
| Indy | Chamoy, Tamarindo | single | should |
| Hola | Tamarind candies | single | should |
| Ravi | Tamarind, Chamoy | single | should |
| Lorena | Pelón-style, Chamoy | single | should |
| Pica | Fresa, Pica Gomas | single | should |

Priority within Mexican candy to be re-ranked from sales data; all stocked brands stay in the tree.

### 3.6 Salty snacks (chips, corn, popcorn)

| Brand line | Variants | Sizes | Priority |
|---|---|---|---|
| Frito-Lay XVL | Cheetos Flamin' Hot, Cheetos Xxtra Flamin' Hot, Cheetos Crunchy, Doritos Nacho, Doritos Dinamita, Fritos Turbos Flamas, Funyuns Flamin' Hot, Munchies Flamin' Hot, Lay's Classic, Ruffles Cheddar | XVL (2.5–3.5oz) | Cheetos Flamin' Hot + Doritos Nacho + Lay's Classic must; the rest should |
| Takis | Fuego, Blue Heat, Crunchy Fajitas | 4oz | Fuego must; Blue Heat should |
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

### Decisions log

- Size classes are per subcategory, not one global candy scheme (Rick, 2026-09-28).
- Chips: XVL only, no 1oz single-serve. Takis stays as its own brand line with Fuego as must.
- Mexican candy is not capped; every stocked brand is listed, priority set by sales data.

## 4. Tobacco & accessories — `discussed`

Kind: **branded**. Mercaso now sells tobacco (it did not when the old sheet was made), so tobacco products are in scope. Every line below except lighters and butane is from market knowledge, not the old sheet, and needs a stock check against Athena in Phase 2. Priorities are by LA liquor-store velocity. Age-restricted items should carry an `age_restricted: true` attribute so downstream tools can filter.

### 4.1 Cigarettes

| Brand line | Variants | Unit | Priority |
|---|---|---|---|
| Marlboro | Red, Gold, Menthol (where legal), Red 100s, Special Blend | pack, carton | Red + Gold must |
| Newport | Box, 100s, Non-Menthol | pack, carton | must |
| Camel | Blue, Crush, Turkish Royal | pack | Blue should |
| American Spirit | Blue, Yellow | pack | should |
| Pall Mall / L&M / Maverick (value) | Red, Blue | pack | one value line must |
| Winston / Kool / Parliament | — | pack | nice |

Note: California banned flavored tobacco including menthol in 2022. Menthol variants stay in the tree marked `restricted: CA` so the model works for other markets; they must not be recommended in CA.

### 4.2 Cigars & cigarillos

| Brand line | Variants | Unit | Priority |
|---|---|---|---|
| Swisher Sweets | Original, Grape, Diamond (unflavored only in CA) | 2-pack, 5-pack | must |
| Backwoods | Original, Honey, Russian Cream | single, 5-pack | Original must |
| Black & Mild | Original, Wood Tip, Casino | single, 5-pack | Original must |
| Game / White Owl / Dutch Masters | unflavored variants | 2-pack | one should |
| Garcia y Vega / Optimo | — | 2-pack | nice |

### 4.3 Vapes & nicotine alternatives

| Brand line | Variants | Unit | Priority |
|---|---|---|---|
| Zyn | 3mg, 6mg; Wintergreen, Cool Mint, Spearmint, Citrus | can | Wintergreen + Cool Mint 6mg must |
| On! / Velo / Rogue (pouches) | — | can | one should |
| Disposable vapes | FDA-authorized tobacco flavor only in CA | unit | check compliance; nice |
| Juul | tobacco pods | pack | nice |

### 4.4 Smokeless & pipe tobacco

| Brand line | Variants | Unit | Priority |
|---|---|---|---|
| Copenhagen | Long Cut, Wintergreen, Snuff | can | Long Cut should |
| Grizzly / Skoal | — | can | nice |
| Bugler / Top / Gambler (roll-your-own) | pouch | pouch | Bugler should |

### 4.5 Lighters & matches

| Brand line | Variants | Unit | Priority |
|---|---|---|---|
| Bic | Classic assorted, Mini | single (50-tray) | Classic must; Mini should |
| Clipper (confirm stocked) | Classic assorted | single | should |
| King / Neon / Clickit (value disposables) | assorted | single (50-tray) | one value line must |
| Eagle Torch | Small, Large | single | Small must; Large should |
| Newport Mini Torch | assorted | single | nice |
| Zippo | lighter fluid 4oz | single | nice |
| Neon / Ronson butane refill | 300ml 5X, 7X | single | one butane refill should |
| D.D. Bean matchbooks | 50ct | box | nice |

### 4.6 Rolling papers, wraps & cones

| Brand line | Variants | Unit | Priority |
|---|---|---|---|
| Zig-Zag | Orange 1¼, White, King Slim | booklet | Orange must |
| RAW | Classic 1¼, King Slim, Cones 3pk | booklet / cone pack | Classic must; Cones should |
| OCB / Elements / Juicy Jay's | 1¼ | booklet | one nice |
| Blunt wraps (Zig-Zag / High Hemp) | assorted | pack | should |

### 4.7 Counter accessories

Kind: **assortment**.

| Slot | Target | Priority |
|---|---|---|
| Glass tubes / one-hitters | 1–2 options | nice |
| Grinders | 1 | nice |
| Rolling trays | 1 | nice |
| Lighter leashes / keychain lighters | 1 | nice |

### Decisions log

- Tobacco products are in scope; Mercaso sells them now (Rick, 2026-09-28).
- Rolling papers and wraps (4.6) confirmed in scope. Lines 4.1–4.4 are market-knowledge drafts pending an Athena stock check.

---

## 5. Mixers, bar tools, cups & bags — `discussed`

Kind: **mixed**. Mixers are branded and cross-reference SCD 1.5 and Juice 2.4. Bar tools, cups, bags and party disposables are **assortment** slots: the recommendation is "carry a 16oz red cup", not a brand. Packaged ice is not carried by Mercaso and is not in the catalog.

### 5.1 Mixers (cross-references)

| Brand line | Where | Priority |
|---|---|---|
| Canada Dry / Schweppes club soda, tonic, ginger ale | SCD 1.5 | must |
| Mott's Clamato 16oz / 32oz | Juice 2.4 | must |
| Ocean Spray Cranberry 15.2oz | Juice 2.4 | should |
| Minute Maid Lemonade 20oz | Juice 2.4 | must |
| Topo Chico 12oz | Water 2.1 | must |
| Squirt 20oz / 2L | SCD 1.3 | must |
| Baja Micheladas cups (Original, Hot, Mango, Pineapple) | 2.6 | must |
| Tajín Clásico 5oz / Chamoy (Mega, Tajín) | Grocery 8 seasonings | must (LA market) |

### 5.2 Bar tools & openers

Kind: **assortment**.

| Slot | Target | Priority |
|---|---|---|
| Corkscrew / waiter's wine key | 1–2 (one value, one better) | must |
| Bottle opener (keychain, flat) | 1–2 | must |
| Flask | 1 | nice |
| Jigger / shot pourer | 1 | nice |
| Michelada rimming tray / cup salt | 1 | nice |

### 5.3 Cups, shot glasses & party disposables

Kind: **assortment**.

| Slot | Target | Mix | Priority |
|---|---|---|---|
| 16oz plastic party cup (red/blue) | 1–2 | Reyma, Imperial, Axxion in old sheet | must |
| 1oz plastic shot glass | 1 | Table King in old sheet | must |
| 24oz michelada cup (rimmed) | 1 | Baja | must |
| 12oz foam cup | 1 | Dart, Wincup, Axxion | should |
| 8oz plastic cup | 1 | Axxion | nice |
| Paper/foam plates 9" | 1 | Axxion, Good Time | should |
| Foam bowls | 1 | | nice |
| Plastic cutlery (forks, spoons) | 1 each | Table King, Sunset | should |
| Bamboo skewers, toothpicks | 1 each | | nice |
| Styrofoam cooler | 1 | in old sheet | should (summer) |

### 5.4 Bags (store operating supplies)

Kind: **assortment**. Supplies the store uses rather than shelves, kept in the tree under a labeled node because the owner orders them in the same trip.

| Slot | Target | Mix | Priority |
|---|---|---|---|
| T-shirt bag black 10×5×19 ("Thank You") | 1 | heavy-duty and standard | must |
| T-shirt bag black 8×4×16 / 6×4×15 (single-bottle) | 1 | | must |
| T-shirt bag 12×7×22 (large, black or white) | 1 | | should |
| Kraft paper bag 2lb / 4lb (bottle bag) | 1 each | Duro | must |
| Reusable bag 13×7×21 | 1 | | nice (CA bag law; confirm current rule) |

### 5.5 Trash & storage bags (household overlap)

Kind: **assortment**. Small set liquor stores stock; full household treatment in department 6.

| Slot | Target | Mix | Priority |
|---|---|---|---|
| Kitchen trash bag 13gal | 1–2 | one value (Sure-Tuff/Ri-Pac), one name brand (Glad/Hefty) | must |
| Large trash bag 30–33gal | 1 | | should |
| Sandwich / zipper bags | 1 | Glad, Kitchen & Beyond | should |

### Decisions log

- Packaged ice is out: Mercaso does not carry it and the catalog does not mention it (Rick, 2026-09-28).
- Bar tools (corkscrews, bottle openers), cups, Tajín and michelada cups stay and are must.
- Store operating supplies stay in the tree under a labeled node (assumed, not objected to).
- Rose's and sweet & sour mix are not carried and are out (Rick, 2026-09-28).

---

## 6. Household & kitchen — `discussed` (assortment)

Kind: **assortment**. This is the first fully assortment department, so the slot rules are stated here and apply to 7 and 8 too.

### Assortment slot rules

- A slot is a shelf need, e.g. "Dish soap, small (≤ 28oz)". It is the leaf of the tree.
- `target_count`: how many distinct SKUs the store should carry in that slot (a range, e.g. 2–3).
- `mix`: what the target should include. Vocabulary: `value` (private label / Latin value brand: NuValu, LA's Totally Awesome, Fabuloso, Pinalen), `national` (Clorox, Tide, Glad), `hispanic` (Zote, Roma, Foca, Suavitel, Ensueño, Veladora). A liquor store in LA usually wants `value + hispanic`; `national` is the upgrade.
- `size_class`: `small` (single-use or trial size, the liquor-store default), `regular`, `bulk` (markets only).
- Priority levels apply to the slot as a whole. Matching attaches every qualifying Mercaso SKU, ranked by velocity; the top `target_count` approved ones are the recommendation.
- Brands in the Mix column below are hints for matching, not part of the leaf.

### 6.1 Cleaning solutions

| Slot | Target | Mix | Size | Priority |
|---|---|---|---|---|
| Multipurpose cleaner | 2 | Fabuloso, Pinalen, LA's Totally Awesome | small, regular | must |
| Bleach | 1–2 | Cloralen, Clorox | small (16–32oz) | must |
| Dish soap | 2 | Palmolive, Ajax, value | small | must |
| Toilet bowl cleaner | 1 | NuValu, Lysol | regular | should |
| Disinfecting wipes / spray | 1 | Clorox, Lysol | small | should |
| Glass cleaner | 1 | Windex, value | small | nice |
| Scouring powder | 1 | Comet, Ajax | regular | nice |
| Shoe polish / Nugget | 1 | Nugget | single | nice |

### 6.2 Laundry

| Slot | Target | Mix | Size | Priority |
|---|---|---|---|---|
| Laundry detergent, liquid | 2 | Tide, Gain, Ariel, Ace; value | small (single-load bottle / pouch) | must |
| Laundry detergent, powder | 1 | Ariel, Roma, Foca | small bag | must (hispanic) |
| Bar soap for laundry | 1 | Zote, Lirio | bar | must (hispanic) |
| Fabric softener | 1–2 | Suavitel, Downy, Ensueño | small | should |
| Dryer sheets | 1 | Bounce, Gain | small box | nice |
| Stain remover | 1 | Soilove, Awesome | single | nice |

### 6.3 Paper & disposables

| Slot | Target | Mix | Size | Priority |
|---|---|---|---|---|
| Toilet paper | 2 | value (Virtue, Jubilee, Melody, 555), national (Charmin, Scott) | single roll, 4-pack | must |
| Paper towels | 1–2 | value (Del Rey, Virtue), national (Bounty) | single roll | must |
| Napkins | 1 | value | pack | should |
| Facial tissue | 1 | Puffs, Softeen | box | nice |
| Aluminum foil | 1 | Reynolds, Durable, value | small roll | should |
| Plastic wrap / sandwich bags | 1 | Glad, Table King | small | nice |
| Aluminum pans | 1 | Durable | single | nice |

### 6.4 Air care, candles & pest

| Slot | Target | Mix | Size | Priority |
|---|---|---|---|---|
| Air freshener spray | 1–2 | Febreze, Air Wick, Glade, Wizard | regular | should |
| Air freshener beads / car | 1 | Wizard, California Scents, LA's Totally | single | nice |
| Religious candle (veladora) | 2–3 | Veladora, Vel-Mex | single | must (LA market) |
| Scented candle | 1 | NuValu | single | nice |
| Incense | 1 | | pack | nice |
| Roach / ant / mosquito | 1–2 | Raid, PIC, Kingman | small | should |

### 6.5 Cleaning equipment & home

| Slot | Target | Mix | Priority |
|---|---|---|---|
| Sponges / scrubbers | 1–2 | NuValu, Scrub Pro | must |
| Latex gloves | 1 | Household, Advance | should |
| Broom / dustpan | 1 | NuValu | nice |
| Spray bottle | 1 | | nice |
| Plunger, bath mat, shower curtain | 1 each | NuValu | nice |
| Batteries AA / AAA / 9V / CR2032 | 1 brand each | Duracell, Panasonic | AA + AAA must; 9V should; CR2032 nice |
| Chargers & cables (USB-C, Lightning, wall block) | 1 each | value | should |
| Charcoal / lighter fluid / firewood | 1 each | Kingsford, El Rey, Duraflame | should (summer) |

---

## 7. Health & beauty — `discussed` (assortment)

Kind: **assortment**. Same slot rules as department 6. The liquor-store version is a single "trial size / emergency" rack, so `size_class: small` everywhere unless noted.

### 7.1 Medicine (OTC)

| Slot | Target | Mix | Priority |
|---|---|---|---|
| Pain reliever (acetaminophen, ibuprofen) | 2 | Tylenol, Advil, Aleve; single-dose 2-packs | must |
| Antacid | 1–2 | Tums, Pepto-Bismol, Alka-Seltzer | must |
| Cough drops | 1 | Halls | must |
| Cold & flu | 1–2 | DayQuil/NyQuil, Alka-Seltzer Plus, Rompe Pecho | must (seasonal) |
| Vapor rub | 1 | Vicks | should |
| Allergy | 1 | Benadryl, generic | should |
| Antifungal / foot | 1 | Derman | nice |
| Energy shot | 1–2 | 5-Hour Energy, Lipovitan | must (counter) |
| Vitamin C / Emergen-C | 1 | | nice |

### 7.2 Oral care & lip

| Slot | Target | Mix | Priority |
|---|---|---|---|
| Toothpaste | 1 | Colgate | must |
| Toothbrush | 1 | Colgate, Oral-B | must |
| Mouthwash | 1 | Listerine, Scope | should |
| Lip balm | 1–2 | ChapStick, Carmex | must (counter) |
| Floss | 1 | Oral-B | nice |

### 7.3 Personal care

| Slot | Target | Mix | Priority |
|---|---|---|---|
| Bar soap | 1–2 | Dove, Zest, Lucky | must |
| Body wash / hand soap | 1 | Lucky, Dove | should |
| Deodorant | 1–2 | Axe, Old Spice, Secret, Speed Stick | must |
| Shampoo / conditioner | 1 | Head & Shoulders, Suave, VO5 | should |
| Hair gel / spray | 1–2 | Moco de Gorila, Super Wet, Xtreme, Aqua Net | should (LA market) |
| Razor, disposable | 1 | Gillette, Dorco, Schick | must |
| Shaving cream | 1 | Gillette | nice |
| Petroleum jelly / lotion | 1 | Vaseline, Nivea, Pond's | should |
| Sunscreen | 1 | Coppertone | nice (summer) |
| Cologne / body spray | 1 | Axe | nice |

### 7.4 Feminine care & family planning

| Slot | Target | Mix | Priority |
|---|---|---|---|
| Pads | 1 | Always | must |
| Tampons | 1 | Tampax | should |
| Condoms | 2 | Trojan (ENZ, Magnum, Ultra Thin) | must (counter) |
| Lubricant | 1 | Trojan | nice |
| Pregnancy test | 1 | | nice |

### 7.5 First aid & hygiene

| Slot | Target | Mix | Priority |
|---|---|---|---|
| Bandages | 1 | Band-Aid, Pure-Aid | must |
| Rubbing alcohol / peroxide | 1 each | | should |
| Hand sanitizer | 1 | NuValu | should |
| Eye drops | 1 | Visine, Clear Eyes | should |
| Cotton swabs | 1 | | nice |
| Face masks | 1 | | nice |

### 7.6 Beauty accessories

| Slot | Target | Priority |
|---|---|---|
| Nail clipper / file | 1 | should |
| Hair ties / combs / brushes | 1–2 | should |
| Lashes / nail polish | 1 | nice |

### Decisions log (departments 6–7)

- Mix vocabulary is `value / national / hispanic` (Rick, 2026-09-28).
- Male enhancement products are out of the catalog.
- Energy shots live under OTC medicine (7.1), not with energy drinks.

---
## 8. Grocery staples — `discussed` (assortment)

Kind: **assortment** with a few branded exceptions (hot sauce, ramen, Tajín) where customers ask by name. A liquor store's grocery aisle is a convenience top-up: what someone grabs at 9pm because the market is closed. Small sizes, one or two options per slot, heavy Hispanic mix. Brands in Mix are from the old sheet unless marked.

### 8.1 Instant meals

| Slot | Target | Mix | Priority |
|---|---|---|---|
| Ramen cup / bowl | 3–4 | Maruchan, Nissin Cup Noodles, Nongshim, Paldo, Tapatio Big Bowl, Samyang Buldak | must |
| Ramen packet | 2 | Maruchan, Nissin Top Ramen, Samyang | must |
| Canned chili / pasta | 1–2 | Hormel, Chef Boyardee, Dinty Moore | should |
| Vienna sausage / Spam | 1 each | Libby's, Hormel | should |
| Canned soup | 1–2 | Campbell's, Maggi, Juanita's Menudo | should (Menudo LA market) |
| Mac & cheese cup | 1 | Kraft (confirm) | nice |

### 8.2 Seasonings, hot sauce & condiments

| Slot | Target | Mix | Priority |
|---|---|---|---|
| Tajín | 1–2 | Tajín Clásico 5oz, Fruit (branded) | must |
| Chamoy | 1 | Mega, Tajín (branded) | must |
| Hot sauce | 2–3 | Tapatío, Valentina, El Yucateco, Cholula, Tabasco (branded) | must |
| Salt / pepper | 1 each | Morton, Sal Bahía, McCormick | should |
| Seasoning blend | 1 | Knorr chicken bouillon, Lawry's | should |
| Mayo / ketchup / mustard | 1 each | McCormick mayo, Hunt's, French's | should |
| Salad dressing | 1 | Wish-Bone | nice |
| Soy sauce | 1 | Kikkoman | nice |

### 8.3 Canned & jarred

| Slot | Target | Mix | Priority |
|---|---|---|---|
| Refried / whole beans | 2 | Sun Vista, Rosarita, La Costeña, Goya | must |
| Jalapeños / chipotle | 1–2 | La Costeña, Embasa, La Morena | must |
| Pickles (single jar / pouch) | 1 | Van Holten's | should |
| Tuna | 1 | Bumble Bee, StarKist | should |
| Sardines / oysters | 1 | Beach Cliff, California Girl | should |
| Canned fruit | 1 | Dole, Del Monte | nice |
| Canned vegetables | 1 | Del Monte | nice |
| Tomato / enchilada sauce | 1 | Las Palmas, El Pato, Hunt's | should |
| Nacho cheese | 1 | Juanita's | nice |

### 8.4 Dry goods & baking

| Slot | Target | Mix | Priority |
|---|---|---|---|
| Rice | 1 | Mahatma, Parrot | should |
| Dry beans | 1 | Goya, Springfield | should |
| Pasta | 1–2 | La Moderna | should |
| Cooking oil | 1 | Mazola, 1-2-3 | should |
| Sugar | 1 | C&H, Zulka | must |
| Flour / masa | 1 | Maseca (confirm) | nice |
| Condensed / evaporated milk | 1 each | La Lechera, Carnation | should |
| Gelatin / flan | 1 | Royal | nice |

### 8.5 Breakfast & pantry

| Slot | Target | Mix | Priority |
|---|---|---|---|
| Cereal | 2 | Kellogg's, General Mills (single-serve or small box) | should |
| Pop-Tarts / toaster pastry | 1 | Kellogg's | should |
| Tortillas | 1 | Mission | must (LA market) |
| Tostadas | 1 | Los Pericos, Charras | should |
| Peanut butter / Nutella | 1 | Skippy, Nutella | nice |
| Syrup / honey | 1 | | nice |

### 8.6 Pet (nice only)

| Slot | Target | Mix | Priority |
|---|---|---|---|
| Dog food, wet single | 1 | Pedigree, Cesar | nice |
| Dog food, dry small bag | 1 | Pedigree, Field Trial | nice |
| Cat food, wet single | 1 | 9 Lives | nice |
| Treats | 1 | Canine Carry Outs | nice |

### Decisions log

- No chilled or frozen: milk, eggs, cheese, ice cream, frozen are out of the catalog (Rick, 2026-09-28).
- Mission tortillas are in (must). Bread is out; Mercaso does not deliver it yet (Rick, 2026-09-28). Guerrero tortillas appear once in the old sheet; confirm in the sales cross-check.
- Hot sauce, Tajín and Chamoy are branded, not assortment.

---
