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

All tables are partitioned by `tenant_id` and `dt`.

## Joins

```
line item --order_id--> order --store_id--> store info (+ manual store-type override)
line item --sku--> item (sku_number, to confirm)
```

Store type is `COALESCE(manual.store_type, store_info.store_type)`, from Rick's query.

## Queries

All in `scripts/athena/sql/`:

| File | Purpose | Output |
|---|---|---|
| `00_discovery.sql` | Seven small checks, run once | Paste results back into the session |
| `products.sql` | Live items with UPCs and attributes, no prices or costs | `data/raw/products.csv` |
| `liquor_sales_by_sku.sql` | Trailing 12 months, CA liquor stores, one row per SKU, with the share of liquor stores that bought it | `data/raw/liquor_sales_by_sku.csv` |

`data/raw/` is gitignored, so exports never reach the repo.

## How to run

Until this environment has working AWS credentials, run the queries in the Athena console and download the results as CSV. Then add the CSVs to the session. Once credentials work, a script can run the same SQL directly.

Direct access needs:
- A read-only access key that STS accepts. The keys in this environment are rejected with `InvalidClientTokenId` as of 2026-09-29.
- The AWS region.
- The Athena workgroup and the S3 location for query results.

These go in the environment's secret settings, never in the repo.

## Assumptions the discovery queries check

| Check | Assumption | If it's wrong |
|---|---|---|
| D1 | Each `*_full` table's latest `dt` is a full snapshot holding all history. There is one `tenant_id`. | Read every `dt`, or filter to Mercaso's tenant. |
| D2 | Liquor stores have a `store_type` containing "liquor". | Use the exact label or labels. |
| D3 | `cancelled_at` marks cancelled orders. | Filter on `order_status` instead. |
| D4 | Line-item `sku` equals the item table's `sku_number`. | Join on `item_id`. |
| D5 | A line's quantity counts what the SKU is sold as, usually a case. | Divide by `package_size`. |
| D6 | UPC types say "each" or "case". Size and flavor may sit in `attribute_ls`. | Adjust the UPC split and the parser. |
| D7 | Status values tell which items are sellable. | Add a status filter to the products export. |
