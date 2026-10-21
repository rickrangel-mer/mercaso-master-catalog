-- Export: the back-test for `pnpm lift` (docs/exploration/penetration-lift.md). Save as
-- data/raw/lift_adopters.csv (gitignored).
--
-- An adopter is a store (covered type, CA) that first bought a catalog item 365–545 days ago,
-- after ordering from Mercaso for at least 90 days (an existing customer adding the item, not a
-- new customer), and had not bought the item in the year before (the window starts 910 days back).
-- item_after is its units of the item in the full year from adoption (cases × case pack), to set
-- against the typical yearly volume the model uses. The runner fills the map below with every
-- approved SKU, its catalog item, category and case pack.
WITH map AS (
  SELECT * FROM (VALUES
  {{SKU_ITEMS}}
  ) AS t(sku, item, cat, pack)
),
stores AS (
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
  SELECT o.order_id, o.store_id, o.created_at
  FROM dwm.dwm_trade_order_detail_full o
  JOIN covered c ON c.store_id = o.store_id
  WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND o.cancelled_at IS NULL
    AND o.created_at >= date_add('day', -910, current_timestamp)
    AND coalesce(o.shipping_province_code, 'CA') = 'CA'
),
first_order AS (
  SELECT store_id, min(created_at) AS first_at FROM orders GROUP BY store_id
),
item_lines AS (
  SELECT o.store_id, o.created_at, m.item, li.current_quantity * m.pack AS units
  FROM dwm.dwm_trade_line_item_detail_full li
  JOIN orders o ON o.order_id = li.order_id
  JOIN map m ON m.sku = li.sku
  WHERE li.dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
    AND li.current_quantity > 0
),
adopters AS (
  SELECT a.store_id, a.item, a.d0
  FROM (SELECT store_id, item, min(created_at) AS d0 FROM item_lines GROUP BY store_id, item) a
  JOIN first_order f ON f.store_id = a.store_id
  WHERE a.d0 >= date_add('day', -545, current_timestamp)
    AND a.d0 < date_add('day', -365, current_timestamp)
    AND f.first_at <= date_add('day', -90, a.d0)
)
SELECT a.store_id, a.item, CAST(a.d0 AS date) AS adopted, sum(il.units) AS item_after
FROM adopters a
JOIN item_lines il ON il.store_id = a.store_id AND il.item = a.item
WHERE il.created_at >= a.d0 AND il.created_at < date_add('day', 365, a.d0)
GROUP BY a.store_id, a.item, a.d0;
