-- Export: one row per CA liquor store that ordered in the last 12 months, for the store view.
-- Save the result as data/raw/liquor_stores.csv (gitignored: store names and spend stay out of git).
--
-- Same store and order rules as liquor_sales_by_sku.sql: store type from the manual sheet or the
-- store record, orders not cancelled, CA only. Status is decided later from last_order_date
-- (Active = ordered in the last 45 days). No contact details are exported.
WITH stores AS (
  SELECT si.store_id,
         COALESCE(NULLIF(trim(st.store_type), ''), NULLIF(trim(si.store_type), '')) AS store_type,
         si.store_number, si.store_name, si.organization_name, si.city,
         SUBSTRING(si.postal_code, 1, 5) AS postal_code
  FROM dim.dim_store_mercaso_store_info_full si
  LEFT JOIN ods.ods_gsheet_manually_collected_ums_store_type_full st
    ON st.store_id = si.store_id
   AND st.dt = (SELECT max(dt) FROM ods.ods_gsheet_manually_collected_ums_store_type_full)
  WHERE si.dt = (SELECT max(dt) FROM dim.dim_store_mercaso_store_info_full)
),
liquor_stores AS (
  SELECT store_id, max(store_number) AS store_number, max(store_name) AS store_name,
         max(organization_name) AS organization_name, max(city) AS city, max(postal_code) AS postal_code
  FROM stores
  WHERE store_type = 'Liquor store'
  GROUP BY store_id
),
orders AS (
  SELECT o.order_id, o.store_id, o.created_at
  FROM dwm.dwm_trade_order_detail_full o
  JOIN liquor_stores ls ON ls.store_id = o.store_id
  WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND o.cancelled_at IS NULL
    AND coalesce(o.shipping_province_code, 'CA') = 'CA'
),
spend AS (
  SELECT o.store_id, sum(li.current_total_amount) AS spend_12m
  FROM dwm.dwm_trade_line_item_detail_full li
  JOIN orders o ON o.order_id = li.order_id
  WHERE li.dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
    AND li.current_quantity > 0
    AND o.created_at >= date_add('month', -12, current_timestamp)
  GROUP BY o.store_id
),
per_store AS (
  SELECT store_id,
         CAST(min(created_at) AS date) AS first_order_date,
         CAST(max(created_at) AS date) AS last_order_date,
         count(DISTINCT CASE WHEN created_at >= date_add('month', -12, current_timestamp) THEN order_id END) AS orders_12m,
         count(DISTINCT CASE WHEN created_at >= date_add('day', -90, current_timestamp) THEN order_id END) AS orders_90d,
         count(DISTINCT CASE WHEN created_at >= date_add('day', -180, current_timestamp)
                              AND created_at < date_add('day', -90, current_timestamp) THEN order_id END) AS orders_prev_90d
  FROM orders
  GROUP BY store_id
)
SELECT
  ls.store_id, ls.store_number, ls.store_name, ls.organization_name, ls.city, ls.postal_code,
  p.first_order_date, p.last_order_date, p.orders_12m, p.orders_90d, p.orders_prev_90d,
  round(coalesce(s.spend_12m, 0), 2) AS spend_12m,
  current_date AS as_of
FROM liquor_stores ls
JOIN per_store p ON p.store_id = ls.store_id
LEFT JOIN spend s ON s.store_id = ls.store_id
WHERE p.orders_12m > 0
ORDER BY p.orders_12m DESC;
