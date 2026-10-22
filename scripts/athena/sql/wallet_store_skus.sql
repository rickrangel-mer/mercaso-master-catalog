-- Export: per covered store and catalog SKU (every store type's approved matches), the last date it
-- was bought up to today and up to 365 days ago, and cases in the last 12 months, for
-- `pnpm wallet`. Save as data/raw/wallet_store_skus.csv (gitignored).
WITH stores AS (
  SELECT si.store_id,
         max(COALESCE(NULLIF(trim(st.store_type), ''), NULLIF(trim(si.store_type), ''))) AS store_type
  FROM dim.dim_store_mercaso_store_info_full si
  LEFT JOIN ods.ods_gsheet_manually_collected_ums_store_type_full st
    ON st.store_id = si.store_id
   AND st.dt = (SELECT max(dt) FROM ods.ods_gsheet_manually_collected_ums_store_type_full)
  WHERE si.dt = (SELECT max(dt) FROM dim.dim_store_mercaso_store_info_full)
  GROUP BY si.store_id
),
covered AS (
  SELECT store_id FROM stores
  WHERE store_type IS NULL
     OR store_type IN ('Liquor store', 'Laundromat', 'Market / grocery', 'Gas station', 'Convenience store', 'Smoke shop', 'Discount dollar')
),
orders AS (
  SELECT o.order_id, o.store_id, o.created_at
  FROM dwm.dwm_trade_order_detail_full o
  JOIN covered c ON c.store_id = o.store_id
  WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND o.cancelled_at IS NULL
    AND o.created_at >= date_add('day', -730, current_timestamp)
    AND coalesce(o.shipping_province_code, 'CA') = 'CA'
)
SELECT o.store_id, li.sku,
  CAST(max(CASE WHEN o.created_at >= date_add('day', -365, current_timestamp) THEN o.created_at END) AS date) AS last_now,
  CAST(max(CASE WHEN o.created_at < date_add('day', -365, current_timestamp) THEN o.created_at END) AS date) AS last_then,
  sum(CASE WHEN o.created_at >= date_add('day', -365, current_timestamp) THEN li.current_quantity ELSE 0 END) AS cases_12m
FROM dwm.dwm_trade_line_item_detail_full li
JOIN orders o ON o.order_id = li.order_id
WHERE li.dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
  AND li.current_quantity > 0
  AND li.sku IN ({{CATALOG_SKUS}})
GROUP BY o.store_id, li.sku;
