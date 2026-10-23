-- Export: the days each CA store ordered since 2025-08-01, for `pnpm acquisition`
-- (docs/exploration/acquisition.md): whether a store was active (ordered in the 45 days before)
-- at each month's end. Save as data/raw/market_store_days.csv. No amounts, names or contacts.
SELECT o.store_id, CAST(o.created_at AS date) AS order_date
FROM dwm.dwm_trade_order_detail_full o
WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
  AND o.cancelled_at IS NULL
  AND coalesce(o.shipping_province_code, 'CA') = 'CA'
  AND o.created_at >= TIMESTAMP '2025-08-01 00:00:00'
GROUP BY 1, 2
ORDER BY 1, 2;
