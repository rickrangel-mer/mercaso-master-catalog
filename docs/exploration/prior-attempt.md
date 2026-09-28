# Prior attempt — review

Source: `mercaso_old_sheet.xlsx` (one sheet, 4,224 rows, 6 columns). Reviewed 2026-09-28. The full department tree with item counts is in `prior-attempt-taxonomy.md`. The sheet itself is not committed because it carries prices.

## What it is

An **order form over the whole Mercaso catalog**, not a curated store list.

| Fact | Value |
|---|---|
| Item rows | 3,109 |
| Groupings (subcategory headers) | 297 |
| Top-level departments | 17 |
| Columns | Subcategory, Item #, Description, Case price, Each price, Qty |
| Qty column filled | never |

Every row is a Mercaso SKU (item number like `DW12282-24`, `JC86000`) with the case description, case price and per-unit price. There is no store type, no priority, no "should carry" signal. A store owner was meant to fill in Qty.

## Structure it used

Three levels, but the middle level is inconsistent:

- **Department** (Beverage, Candy, Snacks, Cleaning, Laundry, Grocery, Health & Beauty, Household & Kitchen, Auto & Electronics, Apparel, Baby, Pet, Office, Party, Store Supplies, Toys, Promo).
- **Group** (only in some departments): "Juices, Nectars & Punch", "Chocolate Brands", "Canned & Jar Foods".
- **Subcategory**, which is one of three different things depending on the department:
  - by **pack/size**: `SODA (2 LITER)`, `SODA (20 OZ)`, `SODA (12 OZ) (24 PACK)`
  - by **brand**: `ARIZONA`, `HARIBO`, `TIDE`, `FRITO LAY`
  - by **product type**: `CLEANING SOLUTIONS`, `MEDICINE`, `CANNED BEANS`, `ORAL CARE`

Candy and Beverage even appear twice: once by type (`GUMMY & CHEWY CANDY`, 157 items) and again by brand (`HARIBO`, `TROLLI`…), so the same SKUs are listed in two places. Some brands repeat across groups (Mentos under Gum and Mints, Skittles under Gummy and Hard candy, Gamesa under Cookies and Snack Cakes).

Sizes live inside the description string ("Coca Cola, Zero, 20 oz (24 Pack)"), so brand, variant, retail size and case pack are all mashed into free text.

## Worth carrying forward

1. **The department list.** The 17 top-level departments and most group names are sensible and match how Mercaso already thinks. The liquor-store outline should reuse these names so matching and reporting line up with the rest of the business.
2. **The brand universe per department.** It tells us exactly which brands Mercaso stocks. The SCD draft missed several the sheet has: Cactus Cooler, Canada Dry, Sprite Lymonade, Mexican Sprite and Mexican Fanta, Shasta (21 items, the value line), and 1L bottles as a size.
3. **Item numbers.** Since the sheet is keyed by Mercaso item number, it is a ready-made first cut of Phase 4 matching: once we parse the description into brand / variant / size / pack, most beverage and candy rows can be auto-attached to catalog leaves. Suffix on item numbers (`-24`, `-8`, `-1`) is the case pack.
4. **The insight that the sheet exists at all**: the earlier attempt tried to solve the cheat sheet by handing customers the whole catalog. That is the failure mode the new project avoids.

## What to drop

- The **duplication** of candy and beverages by type and by brand. Pick one axis per department. Proposal: beverages by category then brand (as in our SCD draft); candy by type then brand.
- **Departments irrelevant to liquor stores** as must-carry: Auto, Apparel, Baby, Office, Toys, Promo, Store Supplies. They may return as `nice` for larger stores or for markets later.
- **Pack-size as the top grouping** for soda. In the new model size is an attribute on the leaf, not a category.
- **Prices**. They belong to the live catalog, not the master catalog.

## What it was missing

- Any notion of **store type** or **priority**. Everything is equal weight.
- **Variants as data**. Diet/Zero are only visible in the description text.
- **Retail unit vs wholesale case**. "20 oz (24 Pack)" is the case Mercaso sells; the store shelves 20 oz singles. Our leaf is the retail unit; the Mercaso SKU is the case. The match must record the case pack so the cheat sheet can say "order one 24-case".
- **Assortment guidance** for household, health & beauty and grocery. `MEDICINE` has 70 items and `CLEANING SOLUTIONS` has 91, with no hint of which handful a liquor store needs. This is exactly where the assortment-leaf model applies.

## Modeling rules adopted from this review

1. Reuse the old sheet's department names as the top level of `data/taxonomy/`.
2. Leaf sizes are **retail units**; the match row carries `case_pack`.
3. One grouping axis per department, no brand-and-type duplication.
4. Description parsing (brand, variant, size, pack from the item description string) is a Phase 4 deliverable and the old sheet is its test fixture.
5. Departments out of scope for liquor v1: Auto & Electronics, Apparel, Baby, Office, Toys & Games, Promo, Store Supplies. Pet is `nice` only.
