-- Export: what each covered store spent per Mercaso department in the last 90 days ("now") and in
-- the 90 days ending 365 days ago ("then"), for `pnpm wallet`. Save as
-- data/raw/wallet_store_dept.csv (gitignored: spend stays out of git). Line totals after refunds.
--   cat_spend  the part spent on the master catalog's approved SKUs (every store type's matches)
--   skus / cat_skus  distinct SKUs bought, and how many of them are catalog SKUs
--   lines  order lines (an order × a SKU), for SKUs per order
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
  SELECT o.order_id, o.store_id,
         CASE WHEN o.created_at >= date_add('day', -90, current_timestamp) THEN 'now' ELSE 'then' END AS win
  FROM dwm.dwm_trade_order_detail_full o
  JOIN covered c ON c.store_id = o.store_id
  WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND o.cancelled_at IS NULL
    AND coalesce(o.shipping_province_code, 'CA') = 'CA'
    AND (o.created_at >= date_add('day', -90, current_timestamp)
      OR (o.created_at >= date_add('day', -455, current_timestamp) AND o.created_at < date_add('day', -365, current_timestamp)))
)
SELECT o.store_id, o.win, coalesce(li.department, '') AS department, round(sum(li.current_total_amount), 2) AS spend,
  round(sum(CASE WHEN li.sku IN ({{CATALOG_SKUS}}) THEN li.current_total_amount ELSE 0 END), 2) AS cat_spend,
  count(DISTINCT li.sku) AS skus,
  count(DISTINCT CASE WHEN li.sku IN ({{CATALOG_SKUS}}) THEN li.sku END) AS cat_skus,
  count(DISTINCT concat(li.order_id, '|', li.sku)) AS lines
FROM dwm.dwm_trade_line_item_detail_full li
JOIN orders o ON o.order_id = li.order_id
WHERE li.dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
  AND li.current_quantity > 0
GROUP BY o.store_id, o.win, li.department;
