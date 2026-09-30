-- Export: what each CA liquor store bought in the last 12 months, limited to the catalog's
-- Mercaso SKUs. Save the result as data/raw/liquor_store_skus.csv (gitignored).
--
-- {{CATALOG_SKUS}} is filled in by the runner with every SKU in data/matches/liquor.csv that is
-- not rejected (approved and pending), so rerun this export after new SKUs are added.
-- One row per store and SKU: orders, cases (after refunds) and the last order date.
WITH stores AS (
  SELECT si.store_id,
         COALESCE(NULLIF(trim(st.store_type), ''), NULLIF(trim(si.store_type), '')) AS store_type
  FROM dim.dim_store_mercaso_store_info_full si
  LEFT JOIN ods.ods_gsheet_manually_collected_ums_store_type_full st
    ON st.store_id = si.store_id
   AND st.dt = (SELECT max(dt) FROM ods.ods_gsheet_manually_collected_ums_store_type_full)
  WHERE si.dt = (SELECT max(dt) FROM dim.dim_store_mercaso_store_info_full)
),
liquor_stores AS (
  SELECT DISTINCT store_id FROM stores WHERE store_type = 'Liquor store'
),
orders AS (
  SELECT o.order_id, o.store_id, o.created_at
  FROM dwm.dwm_trade_order_detail_full o
  JOIN liquor_stores ls ON ls.store_id = o.store_id
  WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND o.cancelled_at IS NULL
    AND o.created_at >= date_add('month', -12, current_timestamp)
    AND coalesce(o.shipping_province_code, 'CA') = 'CA'
)
SELECT o.store_id, li.sku,
       count(DISTINCT li.order_id) AS orders,
       sum(li.current_quantity) AS cases,
       CAST(max(o.created_at) AS date) AS last_order_date
FROM dwm.dwm_trade_line_item_detail_full li
JOIN orders o ON o.order_id = li.order_id
WHERE li.dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
  AND li.current_quantity > 0
  AND li.sku IN ({{CATALOG_SKUS}})
GROUP BY o.store_id, li.sku;
