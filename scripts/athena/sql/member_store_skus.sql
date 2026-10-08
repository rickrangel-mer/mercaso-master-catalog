-- Export: what each store in member_stores.sql bought in the last 90 days (every active member,
-- any store type, and every CA liquor store), limited to the catalog's Mercaso SKUs, for
-- `pnpm member-discount`. Save the result as data/raw/member_store_skus.csv (gitignored).
--
-- Same order rules as liquor_store_skus.sql; {{CATALOG_SKUS}} is filled from the match file.
-- One row per store and SKU: orders, cases (after refunds) and the last order date.
WITH snapshot AS (
  SELECT DISTINCT store_id FROM ods.ods_backend_core_membership_full
  WHERE dt = (SELECT max(dt) FROM ods.ods_backend_core_membership_full)
    AND status = 'ACTIVE'
),
stores AS (
  SELECT si.store_id,
         COALESCE(NULLIF(trim(st.store_type), ''), NULLIF(trim(si.store_type), '')) AS store_type
  FROM dim.dim_store_mercaso_store_info_full si
  LEFT JOIN ods.ods_gsheet_manually_collected_ums_store_type_full st
    ON st.store_id = si.store_id
   AND st.dt = (SELECT max(dt) FROM ods.ods_gsheet_manually_collected_ums_store_type_full)
  WHERE si.dt = (SELECT max(dt) FROM dim.dim_store_mercaso_store_info_full)
),
scope AS (
  SELECT store_id FROM stores WHERE store_type = 'Liquor store'
  UNION
  SELECT store_id FROM snapshot
),
orders AS (
  SELECT o.order_id, o.store_id, o.created_at
  FROM dwm.dwm_trade_order_detail_full o
  JOIN scope sc ON sc.store_id = o.store_id
  WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND o.cancelled_at IS NULL
    AND o.created_at >= date_add('day', -90, current_timestamp)
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
