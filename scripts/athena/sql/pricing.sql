-- Export: today's selling price and average cost per live item, for the site's price and margin
-- columns. Save the result as data/raw/pricing.csv (gitignored). Prices and costs never go in git:
-- the web build merges this file into its own gitignored public/data folder.
--
-- Price: the active promo price when the item is on promo, otherwise the regular price without
-- CRV (the same rule the category team uses). Both are per case (package_size units).
-- Cost: Finale's average_cost is per case and includes CRV, so the case CRV (regular_crv is per
-- unit, times package_size) is taken out to compare like with like:
--   margin = (price - (average_cost - regular_crv * package_size)) / price.
-- Finale's own crv column is blank for some items, so the item table's CRV is used.
-- Member discount: the item's existing membership_discount (dw.ods_ims_item, per case), 0 when unset;
-- `pnpm member-discount` stacks the new discount on top of it.
-- Snapshots: the latest partition on or before today for every table.
WITH anchor AS (SELECT CAST(current_date AS varchar) AS run_dt),
item AS (
  SELECT item_id, sku_number, package_size, regular_no_crv_price, regular_individual_price, regular_crv
  FROM dim.dim_item_item_info_full
  WHERE dt = (SELECT max(dt) FROM "dim"."dim_item_item_info_full$partitions" WHERE dt <= (SELECT run_dt FROM anchor))
    AND availability_status = 'ACTIVE'
    AND deleted_at IS NULL
),
promo AS (
  SELECT item_id, promo_price, promo_price_individual
  FROM (
    SELECT item_id, promo_price, promo_price_individual,
           row_number() OVER (PARTITION BY item_id ORDER BY updated_at DESC) AS rn
    FROM ods.ods_item_management_service_item_promo_price_full
    WHERE dt = (SELECT max(dt) FROM "ods"."ods_item_management_service_item_promo_price_full$partitions" WHERE dt <= (SELECT run_dt FROM anchor))
      AND promo_flag = true
  )
  WHERE rn = 1
),
cost AS (
  SELECT product_id, average_cost, dt AS cost_dt
  FROM ods.ods_finale_report_of_product_full
  WHERE dt = (SELECT max(dt) FROM "ods"."ods_finale_report_of_product_full$partitions" WHERE dt <= (SELECT run_dt FROM anchor))
),
member AS (
  SELECT sku_number, max(TRY_CAST(membership_discount AS double)) AS member_discount
  FROM dw.ods_ims_item
  WHERE __dt = (SELECT max(__dt) FROM dw.ods_ims_item WHERE __dt <= (SELECT run_dt FROM anchor))
    AND deleted_at IS NULL
  GROUP BY sku_number
)
SELECT
  i.sku_number,
  CASE WHEN p.item_id IS NOT NULL THEN 'PROMO' ELSE 'REGULAR' END AS price_type,
  COALESCE(p.promo_price, i.regular_no_crv_price) AS price,
  COALESCE(p.promo_price_individual, i.regular_individual_price) AS price_individual,
  i.regular_no_crv_price AS regular_price,
  round(c.average_cost, 4) AS average_cost_with_crv,
  round(COALESCE(i.regular_crv, 0) * i.package_size, 2) AS case_crv,
  round(c.average_cost - COALESCE(i.regular_crv, 0) * i.package_size, 4) AS average_cost,
  c.cost_dt,
  coalesce(m.member_discount, 0) AS member_discount
FROM item i
LEFT JOIN promo p ON i.item_id = p.item_id
LEFT JOIN cost c ON c.product_id = i.sku_number
LEFT JOIN member m ON m.sku_number = i.sku_number
ORDER BY i.sku_number;
