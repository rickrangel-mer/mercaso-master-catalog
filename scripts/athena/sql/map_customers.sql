-- Export: where Mercaso's active customers are, for the market-gaps map (scripts/slides). Save as
-- data/raw/map_customers.csv. Active = a CA store that ordered in the last 45 days, leaving out store
-- types outside the market (restaurants, hotels, miscellaneous, non-stores). Coordinates and ZIP only:
-- no names, no contact details.
WITH stores AS (
  SELECT si.store_id,
         max(COALESCE(NULLIF(trim(st.store_type), ''), NULLIF(trim(si.store_type), ''))) AS store_type,
         max(substr(trim(si.postal_code), 1, 5)) AS zip,
         max(si.latitude) AS lat,
         max(si.longitude) AS lng
  FROM dim.dim_store_mercaso_store_info_full si
  LEFT JOIN ods.ods_gsheet_manually_collected_ums_store_type_full st
    ON st.store_id = si.store_id
   AND st.dt = (SELECT max(dt) FROM ods.ods_gsheet_manually_collected_ums_store_type_full)
  WHERE si.dt = (SELECT max(dt) FROM dim.dim_store_mercaso_store_info_full)
  GROUP BY si.store_id
),
recent AS (
  SELECT store_id, max(created_at) AS last_at
  FROM dwm.dwm_trade_order_detail_full
  WHERE dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND cancelled_at IS NULL
    AND coalesce(shipping_province_code, 'CA') = 'CA'
  GROUP BY store_id
)
SELECT s.store_id, coalesce(s.store_type, '') AS store_type, coalesce(s.zip, '') AS zip, s.lat, s.lng
FROM recent r
JOIN stores s ON s.store_id = r.store_id
WHERE r.last_at >= date_add('day', -45, current_timestamp)
  AND coalesce(s.store_type, '') NOT IN ('Restaurant', 'Hotel', 'Miscellaneous', 'Non-store')
  AND s.lat IS NOT NULL AND s.lng IS NOT NULL;
