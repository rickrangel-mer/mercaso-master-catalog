-- Export: how many CA liquor stores bought anything in each Mercaso department and category over
-- the trailing 12 months (Phase 2.5 cross-check). Save as data/raw/liquor_reach_by_category.csv.
--
-- Same stores, orders and lines as liquor_sales_by_sku.sql. A SKU's store_share only means
-- something next to its category's reach: few stores buy tobacco or cleaning supplies from
-- Mercaso at all, so a 4% SKU there can be a category leader. Rows with a blank category are
-- department totals.
WITH stores AS (
  SELECT si.store_id,
         -- The manual sheet wins, but a blank override must not hide the store's own type.
         COALESCE(NULLIF(trim(st.store_type), ''), NULLIF(trim(si.store_type), '')) AS store_type,
         SUBSTRING(si.postal_code, 1, 5) AS postal_code
  FROM dim.dim_store_mercaso_store_info_full si
  LEFT JOIN ods.ods_gsheet_manually_collected_ums_store_type_full st
    ON st.store_id = si.store_id
   AND st.dt = (SELECT max(dt) FROM ods.ods_gsheet_manually_collected_ums_store_type_full)
  WHERE si.dt = (SELECT max(dt) FROM dim.dim_store_mercaso_store_info_full)
  GROUP BY 1, 2, 3
),
liquor_stores AS (
  SELECT DISTINCT store_id
  FROM stores
  WHERE store_type = 'Liquor store'
),
orders AS (
  SELECT o.order_id, o.store_id
  FROM dwm.dwm_trade_order_detail_full o
  JOIN liquor_stores ls ON ls.store_id = o.store_id
  WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND o.cancelled_at IS NULL
    AND o.created_at >= date_add('month', -12, current_timestamp)
    AND coalesce(o.shipping_province_code, 'CA') = 'CA'
),
active AS (
  SELECT count(DISTINCT store_id) AS liquor_stores_active FROM orders
),
lines AS (
  SELECT li.sku, li.order_id, li.current_quantity, li.current_total_amount,
         li.title, li.brand_name, li.department, li.category, li.sub_category,
         li.package_type, li.package_size
  FROM dwm.dwm_trade_line_item_detail_full li
  WHERE li.dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
    AND li.current_quantity > 0
)
SELECT
  l.department,
  l.category,
  count(DISTINCT o.store_id) AS stores_buying,
  max(a.liquor_stores_active) AS liquor_stores_active,
  round(CAST(count(DISTINCT o.store_id) AS double) / max(a.liquor_stores_active), 4) AS store_share,
  count(DISTINCT l.sku) AS skus,
  sum(l.current_quantity * coalesce(l.package_size, 1)) AS units
FROM lines l
JOIN orders o ON o.order_id = l.order_id
CROSS JOIN active a
GROUP BY GROUPING SETS ((l.department, l.category), (l.department))
ORDER BY l.department, l.category NULLS FIRST;
