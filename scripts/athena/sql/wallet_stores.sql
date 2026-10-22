-- Export: stores of the covered types (docs/exploration/wallet.md) as of today and as of 365 days
-- ago, for `pnpm wallet`. Save as data/raw/wallet_stores.csv (gitignored). No names or contacts.
-- "then" is the same calculation anchored 365 days back, so 12 months ago and today compare like
-- for like. Orders not cancelled, CA only.
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
  SELECT store_id, store_type FROM stores
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
SELECT o.store_id, coalesce(max(c.store_type), '') AS store_type,
  CAST(max(o.created_at) AS date) AS last_order_now,
  CAST(max(CASE WHEN o.created_at < date_add('day', -365, current_timestamp) THEN o.created_at END) AS date) AS last_order_then,
  count(CASE WHEN o.created_at >= date_add('day', -365, current_timestamp) THEN 1 END) AS orders_12m_now,
  count(CASE WHEN o.created_at < date_add('day', -365, current_timestamp) THEN 1 END) AS orders_12m_then,
  count(CASE WHEN o.created_at >= date_add('day', -90, current_timestamp) THEN 1 END) AS orders_90_now,
  count(CASE WHEN o.created_at >= date_add('day', -455, current_timestamp) AND o.created_at < date_add('day', -365, current_timestamp) THEN 1 END) AS orders_90_then,
  current_date AS as_of
FROM orders o
JOIN covered c ON c.store_id = o.store_id
GROUP BY o.store_id;
