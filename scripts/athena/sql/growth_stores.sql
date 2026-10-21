-- Export: every CA store that ordered from Mercaso in the last 24 months, any store type, with
-- what it spends, for `pnpm growth` (docs/exploration/penetration-lift.md, part 2). Save as
-- data/raw/growth_stores.csv (gitignored: spend stays out of git). No names or contact details.
--   spend_12m / orders_12m       the last 12 months (active stores)
--   spend_before / orders_before the 365 days up to the store's last order (what a churned store
--                                bought before it stopped)
-- Spend is line totals after refunds, orders not cancelled, CA only.
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
orders AS (
  SELECT o.order_id, o.store_id, o.created_at
  FROM dwm.dwm_trade_order_detail_full o
  WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND o.cancelled_at IS NULL
    AND coalesce(o.shipping_province_code, 'CA') = 'CA'
),
per_store AS (
  SELECT store_id, min(created_at) AS first_at, max(created_at) AS last_at FROM orders GROUP BY store_id
),
-- One row per order with its total, over the last 36 months only: the 24-month store window plus
-- the year before a churned store's last order.
order_totals AS (
  SELECT o.store_id, o.order_id, o.created_at, sum(li.current_total_amount) AS amount
  FROM dwm.dwm_trade_line_item_detail_full li
  JOIN orders o ON o.order_id = li.order_id
  WHERE li.dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
    AND li.current_quantity > 0
    AND o.created_at >= date_add('month', -36, current_timestamp)
  GROUP BY o.store_id, o.order_id, o.created_at
)
SELECT p.store_id, coalesce(s.store_type, '') AS store_type,
  CAST(p.first_at AS date) AS first_order_date, CAST(p.last_at AS date) AS last_order_date,
  round(sum(CASE WHEN t.created_at >= date_add('month', -12, current_timestamp) THEN t.amount ELSE 0 END), 2) AS spend_12m,
  sum(CASE WHEN t.created_at >= date_add('month', -12, current_timestamp) THEN 1 ELSE 0 END) AS orders_12m,
  round(sum(CASE WHEN t.created_at > date_add('day', -365, p.last_at) THEN t.amount ELSE 0 END), 2) AS spend_before,
  sum(CASE WHEN t.created_at > date_add('day', -365, p.last_at) THEN 1 ELSE 0 END) AS orders_before,
  current_date AS as_of
FROM per_store p
JOIN order_totals t ON t.store_id = p.store_id
LEFT JOIN stores s ON s.store_id = p.store_id
WHERE p.last_at >= date_add('month', -24, current_timestamp)
GROUP BY p.store_id, s.store_type, p.first_at, p.last_at;
