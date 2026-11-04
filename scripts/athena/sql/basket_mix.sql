-- Export: what the average Mercaso order is made of, by department, over the last six full months
-- (all stores, all states). Save as data/raw/basket_mix.csv. Feeds the basket progression slide.
--
-- per_order is department revenue over every order in the window, so the rows add up to the
-- average order value. order_share is the share of orders with at least one line from the
-- department; ticket is what those orders spend in it. Line quantities are cases, so
-- cases_per_order counts cases and units_per_order counts eaches (cases times package_size).
-- skus_per_order counts distinct SKUs on the order.
WITH orders AS (
  SELECT order_id
  FROM dwm.dwm_trade_order_detail_full
  WHERE dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND cancelled_at IS NULL
    AND created_at >= date_add('month', -6, date_trunc('month', current_timestamp))
    AND created_at < date_trunc('month', current_timestamp)
),
lines AS (
  SELECT li.order_id, coalesce(li.department, '(blank)') AS department, sum(li.current_total_amount) AS amount,
         sum(li.current_quantity) AS cases, sum(li.current_quantity * coalesce(li.package_size, 1)) AS units,
         count(DISTINCT li.sku) AS skus
  FROM dwm.dwm_trade_line_item_detail_full li
  JOIN orders o ON o.order_id = li.order_id
  WHERE li.dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
    AND li.current_quantity > 0
  GROUP BY 1, 2
),
total AS (SELECT count(DISTINCT order_id) AS orders FROM lines)
SELECT
  l.department,
  round(sum(l.amount), 2) AS revenue,
  count(*) AS orders_with,
  max(t.orders) AS orders,
  round(sum(l.amount) / max(t.orders), 2) AS per_order,
  round(CAST(count(*) AS double) / max(t.orders), 4) AS order_share,
  round(sum(l.amount) / count(*), 2) AS ticket,
  round(CAST(sum(l.cases) AS double) / max(t.orders), 3) AS cases_per_order,
  round(CAST(sum(l.units) AS double) / max(t.orders), 2) AS units_per_order,
  round(CAST(sum(l.skus) AS double) / max(t.orders), 3) AS skus_per_order,
  round(sum(l.amount) / nullif(sum(l.cases), 0), 2) AS price_per_case
FROM lines l
CROSS JOIN total t
GROUP BY l.department
ORDER BY revenue DESC;
