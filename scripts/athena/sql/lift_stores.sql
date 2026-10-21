-- Export: every CA store that ordered from Mercaso in the last 12 months, any store type, for
-- `pnpm lift` (docs/exploration/penetration-lift.md). Save as data/raw/lift_stores.csv (gitignored:
-- store names stay out of git). Store type: the manual sheet first, then the store record, as in
-- every other export. Active (ordered in 45 days) is decided in the script from last_order_date.
-- No contact details are exported; the script strips emails from names anyway.
WITH stores AS (
  SELECT si.store_id,
         max(COALESCE(NULLIF(trim(st.store_type), ''), NULLIF(trim(si.store_type), ''))) AS store_type,
         max(si.store_number) AS store_number, max(si.store_name) AS store_name, max(si.city) AS city
  FROM dim.dim_store_mercaso_store_info_full si
  LEFT JOIN ods.ods_gsheet_manually_collected_ums_store_type_full st
    ON st.store_id = si.store_id
   AND st.dt = (SELECT max(dt) FROM ods.ods_gsheet_manually_collected_ums_store_type_full)
  WHERE si.dt = (SELECT max(dt) FROM dim.dim_store_mercaso_store_info_full)
  GROUP BY si.store_id
),
orders AS (
  SELECT o.store_id,
         CAST(max(o.created_at) AS date) AS last_order_date,
         count(DISTINCT o.order_id) AS orders_12m,
         count(DISTINCT CASE WHEN o.created_at >= date_add('day', -90, current_timestamp) THEN o.order_id END) AS orders_90d
  FROM dwm.dwm_trade_order_detail_full o
  WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND o.cancelled_at IS NULL
    AND o.created_at >= date_add('month', -12, current_timestamp)
    AND coalesce(o.shipping_province_code, 'CA') = 'CA'
  GROUP BY o.store_id
)
SELECT o.store_id, coalesce(s.store_type, '') AS store_type, s.store_number, s.store_name, s.city,
       o.last_order_date, o.orders_12m, o.orders_90d, current_date AS as_of
FROM orders o
LEFT JOIN stores s ON s.store_id = o.store_id
ORDER BY o.store_id;
