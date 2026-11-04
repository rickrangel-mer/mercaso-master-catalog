-- Export: average order value by month and department over the last 13 full months (all stores).
-- Save as data/raw/basket_trend.csv. Shows which departments moved the basket over the year.
WITH orders AS (
  SELECT order_id, date_format(created_at, '%Y-%m') AS month
  FROM dwm.dwm_trade_order_detail_full
  WHERE dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND cancelled_at IS NULL
    AND created_at >= date_add('month', -13, date_trunc('month', current_timestamp))
    AND created_at < date_trunc('month', current_timestamp)
),
lines AS (
  SELECT o.month, li.order_id,
         CASE WHEN li.department IN ('Beverage', 'Candy & Snacks', 'Tobacco', 'Grocery', 'Cleaning & Laundry',
                                     'Household & Kitchen', 'Health & Beauty')
              THEN li.department ELSE 'Other' END AS department,
         li.current_total_amount AS amount
  FROM dwm.dwm_trade_line_item_detail_full li
  JOIN orders o ON o.order_id = li.order_id
  WHERE li.dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
    AND li.current_quantity > 0
),
monthly AS (SELECT month, count(DISTINCT order_id) AS orders FROM lines GROUP BY 1)
SELECT l.month, l.department, max(m.orders) AS orders,
       round(sum(l.amount) / max(m.orders), 2) AS per_order,
       round(CAST(count(DISTINCT l.order_id) AS double) / max(m.orders), 4) AS order_share
FROM lines l
JOIN monthly m ON m.month = l.month
GROUP BY 1, 2
ORDER BY 1, 2;
