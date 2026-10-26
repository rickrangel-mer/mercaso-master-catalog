-- Export: every CA store that ordered in the last 24 months with its Google place id, address and
-- coordinates from Mercaso's store record, for matching against a Google Places scrape
-- (`pnpm places`, docs/exploration/places.md). Save as data/raw/store_places.csv (gitignored).
-- Names and addresses never leave data/raw and dist/; no contact details.
WITH orders AS (
  SELECT o.store_id, max(o.created_at) AS last_at, min(o.created_at) AS first_at
  FROM dwm.dwm_trade_order_detail_full o
  WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND o.cancelled_at IS NULL
    AND coalesce(o.shipping_province_code, 'CA') = 'CA'
  GROUP BY o.store_id
),
types AS (
  SELECT store_id, max(NULLIF(trim(store_type), '')) AS store_type
  FROM ods.ods_gsheet_manually_collected_ums_store_type_full
  WHERE dt = (SELECT max(dt) FROM ods.ods_gsheet_manually_collected_ums_store_type_full)
  GROUP BY store_id
)
SELECT si.store_id,
       max(trim(si.store_name)) AS store_name,
       max(COALESCE(t.store_type, NULLIF(trim(si.store_type), ''), '')) AS store_type,
       max(coalesce(si.place_id, '')) AS place_id,
       max(coalesce(si.line_1, '')) AS line_1,
       max(substr(trim(si.postal_code), 1, 5)) AS zip,
       max(si.latitude) AS lat,
       max(si.longitude) AS lng,
       CAST(max(o.first_at) AS date) AS first_order_date,
       CAST(max(o.last_at) AS date) AS last_order_date
FROM dim.dim_store_mercaso_store_info_full si
JOIN orders o ON o.store_id = si.store_id
LEFT JOIN types t ON t.store_id = si.store_id
WHERE si.dt = (SELECT max(dt) FROM dim.dim_store_mercaso_store_info_full)
  AND o.last_at >= date_add('month', -24, current_timestamp)
GROUP BY si.store_id;
