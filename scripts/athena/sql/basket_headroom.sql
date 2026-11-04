-- Export: how often stores buy each department, typical store against the top quartile, over the
-- last six full months. Save as data/raw/basket_headroom.csv. Feeds the basket progression slide.
--
-- Only stores with six or more orders in the window count, so a store's order share is not noise.
-- Small departments are folded into Other. For each store, order_share is the share of its orders
-- with at least one line from the department (0 when it never bought there). share_avg weights
-- stores by orders; share_p50 and share_p75 are store percentiles. ticket is what an order spends
-- in the department when it buys there. Headroom per order = (share_p75 - share_avg) * ticket.
WITH orders AS (
  SELECT order_id, store_id
  FROM dwm.dwm_trade_order_detail_full
  WHERE dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND cancelled_at IS NULL
    AND created_at >= date_add('month', -6, date_trunc('month', current_timestamp))
    AND created_at < date_trunc('month', current_timestamp)
),
lines AS (
  SELECT o.store_id, li.order_id,
         CASE WHEN li.department IN ('Beverage', 'Candy & Snacks', 'Tobacco', 'Grocery', 'Cleaning & Laundry',
                                     'Household & Kitchen', 'Health & Beauty')
              THEN li.department ELSE 'Other' END AS department,
         sum(li.current_total_amount) AS amount
  FROM dwm.dwm_trade_line_item_detail_full li
  JOIN orders o ON o.order_id = li.order_id
  WHERE li.dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
    AND li.current_quantity > 0
  GROUP BY 1, 2, 3
),
stores AS (
  SELECT store_id, count(DISTINCT order_id) AS orders FROM lines GROUP BY 1 HAVING count(DISTINCT order_id) >= 6
),
departments AS (SELECT DISTINCT department FROM lines),
store_department AS (
  SELECT s.store_id, s.orders, d.department,
         count(DISTINCT l.order_id) AS orders_with,
         coalesce(sum(l.amount), 0) AS amount
  FROM stores s
  CROSS JOIN departments d
  LEFT JOIN lines l ON l.store_id = s.store_id AND l.department = d.department
  GROUP BY 1, 2, 3
)
SELECT
  department,
  count(*) AS stores,
  round(avg(CASE WHEN orders_with > 0 THEN 1.0 ELSE 0.0 END), 4) AS store_reach,
  round(CAST(sum(orders_with) AS double) / sum(orders), 4) AS share_avg,
  round(approx_percentile(CAST(orders_with AS double) / orders, 0.5), 4) AS share_p50,
  round(approx_percentile(CAST(orders_with AS double) / orders, 0.75), 4) AS share_p75,
  round(sum(amount) / nullif(sum(orders_with), 0), 2) AS ticket,
  round(sum(amount) / sum(orders), 2) AS per_order
FROM store_department
GROUP BY department
ORDER BY per_order DESC;
