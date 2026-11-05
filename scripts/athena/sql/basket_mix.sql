-- Export: what the average Mercaso order is made of, by department, over the last six full months
-- and the same six months a year earlier (all stores, all states). Save as data/raw/basket_mix.csv.
-- Feeds the basket progression slides.
--
-- period is 'current' (last six full months) or 'prior' (the same months a year before).
-- per_order is department revenue over every order in the window, so a period's rows add up to the
-- average order value. order_share is the share of orders with at least one line from the
-- department; ticket is what those orders spend in it. Line quantities are cases, so
-- cases_per_order counts cases and units_per_order counts eaches (cases times package_size).
-- skus_per_order counts distinct SKUs on the order.
WITH bounds AS (
  SELECT date_trunc('month', current_timestamp) AS this_month
),
orders AS (
  SELECT o.order_id,
         CASE WHEN o.created_at >= date_add('month', -6, b.this_month) THEN 'current' ELSE 'prior' END AS period
  FROM dwm.dwm_trade_order_detail_full o
  CROSS JOIN bounds b
  WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND o.cancelled_at IS NULL
    AND ((o.created_at >= date_add('month', -6, b.this_month) AND o.created_at < b.this_month)
      OR (o.created_at >= date_add('month', -18, b.this_month) AND o.created_at < date_add('month', -12, b.this_month)))
),
lines AS (
  SELECT o.period, li.order_id, coalesce(li.department, '(blank)') AS department, sum(li.current_total_amount) AS amount,
         sum(li.current_quantity) AS cases, sum(li.current_quantity * coalesce(li.package_size, 1)) AS units,
         count(DISTINCT li.sku) AS skus
  FROM dwm.dwm_trade_line_item_detail_full li
  JOIN orders o ON o.order_id = li.order_id
  WHERE li.dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
    AND li.current_quantity > 0
  GROUP BY 1, 2, 3
),
total AS (SELECT period, count(DISTINCT order_id) AS orders FROM lines GROUP BY 1)
SELECT
  l.period,
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
JOIN total t ON t.period = l.period
GROUP BY l.period, l.department
ORDER BY l.period, revenue DESC;
