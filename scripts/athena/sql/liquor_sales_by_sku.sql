-- Export: trailing-12-month sales to liquor stores, one row per SKU (Phase 2.5 cross-check).
-- Save the result as data/raw/liquor_sales_by_sku.csv (gitignored).
--
-- Joins: line items -> orders (order_id) -> stores (store_id) -> store type (Rick's query).
-- Counts only liquor stores in CA, only orders not cancelled (cancelled_at), and quantities
-- after refunds. The latest dt of each table holds full history; tenant_id is ignored.
-- Quantities are cases; `units` multiplies by the case pack.
-- `store_share` is the fraction of active liquor stores that bought the SKU at least once,
-- which is the best single signal for "should every liquor store carry this".
-- For another store type, change the one store_type literal below (e.g. 'Laundromat').
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
  l.sku,
  max(l.title) AS title,
  max(l.brand_name) AS brand_name,
  max(l.department) AS department,
  max(l.category) AS category,
  max(l.sub_category) AS sub_category,
  max(l.package_type) AS package_type,
  max(l.package_size) AS package_size,
  sum(l.current_quantity) AS cases,
  sum(l.current_quantity * coalesce(l.package_size, 1)) AS units,
  sum(l.current_total_amount) AS revenue,
  count(DISTINCT l.order_id) AS orders,
  count(DISTINCT o.store_id) AS stores_buying,
  max(a.liquor_stores_active) AS liquor_stores_active,
  round(CAST(count(DISTINCT o.store_id) AS double) / max(a.liquor_stores_active), 4) AS store_share
FROM lines l
JOIN orders o ON o.order_id = l.order_id
CROSS JOIN active a
GROUP BY l.sku
ORDER BY stores_buying DESC, revenue DESC;
