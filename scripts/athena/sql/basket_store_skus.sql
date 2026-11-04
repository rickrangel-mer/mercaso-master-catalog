-- Export: how many distinct SKUs a store buys from Mercaso in a year, by department, over the last
-- twelve full months (all stores). Save as data/raw/basket_store_skus.csv. Feeds the basket
-- progression slide when it counts SKUs per store per year.
--
-- A SKU belongs to one department, so the department averages add up to the store total.
-- avg_skus averages over every store that ordered in the window; avg_skus_regular only over stores
-- with 12 or more orders (about monthly or better), which leaves out one-off and churned stores.
WITH orders AS (
  SELECT order_id, store_id
  FROM dwm.dwm_trade_order_detail_full
  WHERE dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND cancelled_at IS NULL
    AND created_at >= date_add('month', -12, date_trunc('month', current_timestamp))
    AND created_at < date_trunc('month', current_timestamp)
),
lines AS (
  SELECT o.store_id, o.order_id, coalesce(li.department, '(blank)') AS department, li.sku
  FROM dwm.dwm_trade_line_item_detail_full li
  JOIN orders o ON o.order_id = li.order_id
  WHERE li.dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
    AND li.current_quantity > 0
),
stores AS (
  SELECT store_id, count(DISTINCT order_id) AS orders FROM lines GROUP BY 1
),
store_department AS (
  SELECT store_id, department, count(DISTINCT sku) AS skus FROM lines GROUP BY 1, 2
),
totals AS (
  SELECT count(*) AS stores, count_if(orders >= 12) AS regular_stores FROM stores
)
SELECT
  sd.department,
  max(t.stores) AS stores,
  max(t.regular_stores) AS regular_stores,
  round(CAST(sum(sd.skus) AS double) / max(t.stores), 2) AS avg_skus,
  round(CAST(sum(CASE WHEN s.orders >= 12 THEN sd.skus ELSE 0 END) AS double) / max(t.regular_stores), 2) AS avg_skus_regular
FROM store_department sd
JOIN stores s ON s.store_id = sd.store_id
CROSS JOIN totals t
GROUP BY sd.department
ORDER BY avg_skus DESC;
