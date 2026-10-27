-- Export: per CA store and calendar month since 2025-10-01, its orders, sales, units and order lines,
-- for `pnpm forecast` (docs/exploration/forecast.md). Save as data/raw/forecast_store_months.csv
-- (gitignored: sales stay out of git). Orders not cancelled; line totals after refunds.
--   units  cases (line quantities)
--   lines  order lines: an order × a SKU, so SKUs per order = lines ÷ orders
WITH orders AS (
  SELECT o.order_id, o.store_id, date_trunc('month', o.created_at) AS month
  FROM dwm.dwm_trade_order_detail_full o
  WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND o.cancelled_at IS NULL
    AND coalesce(o.shipping_province_code, 'CA') = 'CA'
    AND o.created_at >= TIMESTAMP '2025-10-01 00:00:00'
)
SELECT o.store_id, CAST(o.month AS date) AS month,
  count(DISTINCT o.order_id) AS orders,
  round(sum(li.current_total_amount), 2) AS revenue,
  sum(li.current_quantity) AS units,
  count(DISTINCT concat(li.order_id, '|', li.sku)) AS lines
FROM dwm.dwm_trade_line_item_detail_full li
JOIN orders o ON o.order_id = li.order_id
WHERE li.dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
  AND li.current_quantity > 0
GROUP BY o.store_id, o.month
ORDER BY 1, 2;
