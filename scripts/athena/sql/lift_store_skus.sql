-- Export: what each CA store of a covered type bought in the last 12 months, limited to the
-- catalogs' approved SKUs (every store type's match file), for `pnpm lift`. Save as
-- data/raw/lift_store_skus.csv (gitignored). Covered types: the ones a catalog fits
-- (docs/exploration/penetration-lift.md); stores with no type set are included.
-- One row per store and SKU: orders, cases (after refunds) and the last order date.
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
  LEFT JOIN stores s ON s.store_id = o.store_id
  WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND o.cancelled_at IS NULL
    AND o.created_at >= date_add('month', -12, current_timestamp)
    AND coalesce(o.shipping_province_code, 'CA') = 'CA'
    AND (s.store_id IS NULL OR s.store_id IN (SELECT store_id FROM covered))
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
