# Athena data for the catalog

What the sales cross-check (Phase 2.5) and SKU matching (Phase 4) read from Mercaso's Athena, and how to run it. Table names came from Rick on 2026-09-29.

## Tables

| Table | Grain | What we use |
|---|---|---|
| `dim.dim_item_item_info_full` | one row per item, daily snapshot `dt` | SKU, brand, name and descriptions, package size, department to class, sales and availability status, UPCs (`upc_ls`), attributes (`attribute_ls`), tags |
| `dwm.dwm_trade_line_item_detail_full` | one row per order line | `sku`, `order_id`, `current_quantity` (after refunds), `current_total_amount`, plus item fields copied onto the line |
| `dwm.dwm_trade_order_detail_full` | one row per order | `order_id`, `store_id`, `created_at`, `cancelled_at`, `order_status`, `shipping_province_code` |
| `dim.dim_store_mercaso_store_info_full` | one row per store | `store_id`, `store_type`, `postal_code` |
| `ods.ods_gsheet_manually_collected_ums_store_type_full` | manual corrections | `store_type` and store name overrides by `store_id` |

All tables are partitioned by `tenant_id` and `dt`. The latest `dt` of each table holds the full history, and `tenant_id` can be ignored.

## Joins

```
line item --order_id--> order --store_id--> store info (+ manual store-type override)
line item --sku--> item (sku_number or item_id; both work)
```

Store type is the manual sheet's value where it is not blank, otherwise the store table's, following Rick's query.

## Queries

All in `scripts/athena/sql/`:

| File | Purpose | Output |
|---|---|---|
| `products.sql` | Live items with UPCs and attributes, no prices or costs | `data/raw/products.csv` |
| `liquor_sales_by_sku.sql` | Trailing 12 months, CA liquor stores, one row per SKU: cases, units, revenue, orders, and the share of liquor stores that bought it | `data/raw/liquor_sales_by_sku.csv` |
| `optional_checks.sql` | Attribute names and item statuses, for tuning the matcher | Not needed for the exports |

`data/raw/` is gitignored, so exports never reach the repo.

## How to run

Until this environment has working AWS credentials, run the queries in the Athena console and download the results as CSV. Then add the CSVs to the session. Once credentials work, a script can run the same SQL directly.

Direct access needs:
- A read-only access key that STS accepts. The keys in this environment are rejected with `InvalidClientTokenId` as of 2026-09-29.
- The AWS region.
- The Athena workgroup and the S3 location for query results.

These go in the environment's secret settings, never in the repo.

## Confirmed facts (Rick, 2026-09-29)

- **Snapshots.** The latest `dt` of each `*_full` table holds the full history. `tenant_id` can be ignored.
- **Cancelled orders.** `cancelled_at` marks them.
- **Join key.** Line-item `sku` joins to the item table's `sku_number` or `item_id`.
- **Quantities are cases.** A line's `current_quantity` counts cases, so units are cases times `package_size`.
- **UPCs.** `upc_ls` holds entries such as `{upc_number=814669012782, upc_type=EACH_UPC}`. The same code often appears with and without a leading zero, so the export strips leading zeros and drops duplicates.
- **Attributes.** `attribute_ls` holds entries such as `Item size = 3.0000 L`, `Bottle Size = 3.0000 L` and `Flavor = Strawberry`. The products export turns these three into columns.
- **Store types.** Both the store table and the manual sheet use the same labels:
  - Liquor store, Laundromat, Convenience store, Market / grocery
  - Gas station, Smoke shop, Discount dollar, Restaurant, Hotel
  - Miscellaneous, Non-store, Unknown, and blank
- **Blank overrides.** The manual sheet wins, except where it is blank. A blank there must not hide the store's own type, so the query treats blanks as missing.
