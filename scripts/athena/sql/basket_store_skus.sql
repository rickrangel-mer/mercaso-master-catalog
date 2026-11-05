-- Export: how many distinct SKUs a store buys from Mercaso in a year, by department, over the last
-- twelve full months and the twelve before them (all stores). Save as data/raw/basket_store_skus.csv.
-- Feeds the basket progression slides.
--
-- period is 'current' (last twelve full months) or 'prior' (the twelve months before). A SKU
-- belongs to one department, so a period's department averages add up to the store total.
-- avg_skus averages over every store that ordered in the period; avg_skus_regular only over stores
-- with 12 or more orders in it (about monthly or better), which leaves out one-off and churned stores.
WITH bounds AS (
  SELECT date_trunc('month', current_timestamp) AS this_month
),
orders AS (
  SELECT o.order_id, o.store_id,
         CASE WHEN o.created_at >= date_add('month', -12, b.this_month) THEN 'current' ELSE 'prior' END AS period
  FROM dwm.dwm_trade_order_detail_full o
  CROSS JOIN bounds b
  WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND o.cancelled_at IS NULL
    AND o.created_at >= date_add('month', -24, b.this_month)
    AND o.created_at < b.this_month
),
lines AS (
  SELECT o.period, o.store_id, o.order_id, coalesce(li.department, '(blank)') AS department, li.sku
  FROM dwm.dwm_trade_line_item_detail_full li
  JOIN orders o ON o.order_id = li.order_id
  WHERE li.dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
    AND li.current_quantity > 0
),
stores AS (
  SELECT period, store_id, count(DISTINCT order_id) AS orders FROM lines GROUP BY 1, 2
),
store_department AS (
  SELECT period, store_id, department, count(DISTINCT sku) AS skus FROM lines GROUP BY 1, 2, 3
),
totals AS (
  SELECT period, count(*) AS stores, count_if(orders >= 12) AS regular_stores FROM stores GROUP BY 1
)
SELECT
  sd.period,
  sd.department,
  max(t.stores) AS stores,
  max(t.regular_stores) AS regular_stores,
  round(CAST(sum(sd.skus) AS double) / max(t.stores), 2) AS avg_skus,
  round(CAST(sum(CASE WHEN s.orders >= 12 THEN sd.skus ELSE 0 END) AS double) / max(t.regular_stores), 2) AS avg_skus_regular
FROM store_department sd
JOIN stores s ON s.period = sd.period AND s.store_id = sd.store_id
JOIN totals t ON t.period = sd.period
GROUP BY sd.period, sd.department
ORDER BY sd.period, avg_skus DESC;
