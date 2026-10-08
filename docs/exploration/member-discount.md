# Member discount — handoff for the side project

Started 2026-10-08. A side project built on the master catalog and the store view (Phase 5). The first version is built (`pnpm member-discount`, see **Built** below) and waiting for Rick's review of the CSV before any site work.

## Goal

Find the master-catalog SKUs that are **under-represented among stores in Mercaso's membership program**, and give members an extra discount on them, so members pick up items they don't buy from us yet.

## The rule (Rick, 2026-10-08)

Member penetration of a SKU = share of active member stores that bought it. The lowest band that applies wins:

| Member penetration | Extra discount |
|---|---|
| under 15% | $0.50 |
| under 10% | $1.00 |
| under 5% | $2.00 |
| 15% or more | none |

**Margin floor: 5%.** After the discount, the SKU must still make at least a 5% margin:

> (price − discount − cost) ÷ (price − discount) ≥ 5%, which means **discount ≤ price − cost ÷ 0.95**

with `price` = today's case price without CRV (the promo price when on promo) and `cost` = Finale's average case cost without CRV, the same definitions as the site's price and margin columns (`scripts/athena/sql/pricing.sql`). Example: Coke 20oz 24-pack at $36.49 with a $34.28 cost has room for $0.40 at most, so even the $0.50 band fails the floor.

## Who the members are

Rick's definition of current active member stores:

```sql
SELECT DISTINCT store_id
FROM ods.ods_backend_core_membership_full
WHERE dt = (SELECT MAX(dt) FROM ods.ods_backend_core_membership_full)
  AND status = 'ACTIVE';
```

First look (2026-10-08): **1,138 active member stores** (also 296 cancelled and 39 suspended memberships). The program started 2026-06-08. By store type (same store-type rule as the catalog work):

| Store type | Active members |
|---|---|
| Liquor store | 496 |
| Gas station | 166 |
| Market / grocery | 155 |
| Convenience store | 88 |
| No type set | 69 |
| Laundromat | 47 |
| Smoke shop | 44 |
| Restaurant | 40 |
| Others | 33 |

Also seen in Athena: `dw.ods_ims_item.membership_discount`, an item-level member discount. Checked 2026-10-08: it is 0.00 on every item in the latest snapshot except one non-catalog SKU at $0.01, so no catalog SKU has a member discount today. `pricing.sql` now exports it (`member_discount`) and the new discount stacks on top of it.

## What we can reuse

- **SKUs:** approved rows in `data/matches/liquor.csv` (the liquor master catalog), each with its catalog item, priority, department and category.
- **Who bought what:** `scripts/athena/sql/liquor_store_skus.sql` (store × SKU, cases, last order date; `{{CATALOG_SKUS}}` filled from the match file). A members version swaps the liquor-store filter for the membership query above.
- **Price and cost:** `pnpm athena:export pricing` → `data/raw/pricing.csv` (price, promo flag, average cost without CRV). Never committed.
- **Scoring pattern:** `apps/web/lib/score.ts` (`scoreWindow`) already computes "carried within N days" and peer adoption; member penetration is the same calculation over the member stores.
- **Supply holds:** `supply_hold` in `data/store-types/liquor.yaml` (Arizona 22oz cans today) should be excluded from discounts.
- **Site:** a "Member discounts" view could sit beside the Stores tab and reuse its table components; CSV output first is enough.

## Proposed build

1. **Export** `member-store-skus`: store × catalog SKU for active member stores, plus a member store list (store type, orders, status) so results can be cut by store type. Same privacy rules as the store view: no contact details, nothing committed.
2. **Script** `pnpm member-discount` (pure logic with tests): per SKU, member penetration over the window; the band and discount; the maximum discount the 5% floor allows; the final discount; and the reason when a SKU is excluded.
3. **Output:** `dist/member-discount/liquor.csv` (gitignored), one row per SKU: catalog item, priority, department, SKU and product, member penetration (and the non-member liquor-store penetration for context), band, price, promo, cost, margin before and after, discount, and the exclusion reason. Plus a short summary: SKUs per band, how many failed the floor, and the cost of the program at current member volumes.
4. **Review with Rick**, then optionally a site view.

## Decisions (Rick, 2026-10-08)

1. **Which members:** the discount is meant for every member, but this first version measures penetration over the **496 liquor-store members**, matching the liquor catalog. All-member penetration (1,138) is shown for context.
2. **Window:** 90 days.
3. **Per catalog item:** a store that buys any approved SKU of the item counts. The discount then goes on every approved SKU of the item, each checked against its own price and cost.
4. **Per case.**
5. **Floor:** step down $2 → $1 → $0.50; drop the SKU if even $0.50 breaks the 5% margin.
6. **Priorities:** must and should.
7. **Floor items:** an item needs some purchasing: items no store (member or not) bought in the window are excluded (`no_sales`). Items bought by other stores but by no liquor member are kept and flagged (`no_member_buyers`).
8. **Stacking:** the discount comes off the promo price when on promo, and on top of any existing member discount; the floor holds after everything. The CSV and summary split promo from non-promo SKUs.

**Membership timeline:** a store counts when it has an ACTIVE row in the latest snapshot. Some stores have several membership rows; the export flags ACTIVE rows to double-check: a cancelled or suspended row updated after the active one (1 store on 2026-10-08), a period that ended without a renewal yet (16, mostly due the day of the snapshot) and cancel at period end (8). They are counted as members for now.

## Built (2026-10-08)

```
pnpm athena:export pricing member-stores member-store-skus
pnpm member-discount
```

- `member_stores.sql` → `data/raw/member_stores.csv`: every active member (any store type) and every CA liquor store, with store type, member flag, timeline flags and orders in 90 days. Store ids only: no names or contact details.
- `member_store_skus.sql` → `data/raw/member_store_skus.csv`: store × catalog SKU over 90 days for those stores (same order rules as `liquor_store_skus.sql`).
- `scripts/member-discount/` (logic in `lib.ts`, tests beside it): item penetration through the store view's `buildBase` + `scoreWindow`, for liquor members, non-member liquor stores that ordered in the window, and all members. Then the band, the floor (`max_discount_at_floor`, whole cents), the stepped-down discount and the exclusion reason (`penetration_15pct_plus`, `supply_hold`, `no_sales`, `no_price`, `no_cost`, `margin_floor`). A SKU on two items (cigarette pack and carton) gets one row, following the item more members buy.
- Output (gitignored): `dist/member-discount/liquor.csv`, one row per approved must/should SKU, and `liquor-summary.md` with SKUs per discount (promo split), the reasons for no discount, and the cost at current member volumes (discount × member cases in 90 days, liquor members and all members, no lift assumed).

First run (2026-10-08, counts only): 760 SKUs on 560 must/should items scored; **371 SKUs (255 items) get a discount**: 71 at $2, 175 at $1, 125 at $0.50, of which 60 are on promo; 66 were stepped down. 313 SKUs are at 15% or more; 59 fail the floor even at $0.50 (most 20oz sodas and cigarettes); 3 are on supply hold, 6 had no sales, 1 has no price, 7 no Finale cost.

## Decisions as first listed

1. **Which members:** liquor-store members only (496, matching the liquor catalog), or every member store type (1,138)? The catalog is built for liquor stores, so other types would be scored against items they may not carry.
2. **Window:** penetration over how many days? The program is only four months old, so 90 days (the site's default) or "since the store joined" are the natural choices; 12 months would mix pre-membership buying.
3. **SKU or item level:** a SKU's penetration can look low because stores buy its twin (another case pack or a NON PRE-PRICED version). Measure per catalog item and discount its recommended SKU, or measure each SKU on its own?
4. **Per case or per unit:** the price and cost data are per case. $0.50 / $1 / $2 per case is the natural reading; per unit would be 6–48 times larger.
5. **When the band's discount breaks the 5% floor:** step down to the largest band amount that still fits ($2 → $1 → $0.50), cap at the exact allowed amount (odd cents), or exclude the SKU? The recommendation is to step down, then exclude if even $0.50 fails.
6. **Which priorities:** all of must, should and nice, or must and should only? Nice items are often low-penetration by nature.
7. **Floor items:** SKUs with no penetration at all (0 members bought them) qualify for $2. Do those stay in, or is a minimum number of buyers needed so the list isn't full of items nobody wants?
8. **Stacking:** base the discount on the promo price when a SKU is on promo, and on top of any existing `membership_discount`? The floor should hold after everything.

## Caveats

- **Penetration counts purchases from Mercaso only.** A member buying an item from the bottler or another distributor looks like a non-buyer.
- **Low penetration can mean low demand, not under-representation.** Comparing member and non-member penetration of the same SKU (step 3) shows which.
- **Price and cost are a snapshot.** Promo prices change weekly, so the discount list should be recomputed at the price date it will run with.
