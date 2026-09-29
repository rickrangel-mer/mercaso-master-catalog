-- Discovery: run each query once in the Athena console and paste the results back.
-- They confirm what the export queries assume. Each is small or limited.

-- D1. Are the *_full tables daily full snapshots? List the latest partitions, then count rows
--     in the three newest. Similar counts mean each dt is a full snapshot, so max(dt) holds
--     all history. Small, uneven counts mean dt is incremental and the exports must read
--     every dt instead. Also shows which tenant_id values exist.
SELECT * FROM dwm."dwm_trade_order_detail_full$partitions" ORDER BY dt DESC LIMIT 6;

SELECT dt, tenant_id, count(*) AS rows
FROM dwm.dwm_trade_order_detail_full
WHERE dt IN (SELECT DISTINCT dt FROM dwm.dwm_trade_order_detail_full ORDER BY dt DESC LIMIT 3)
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- D2. Store types and how many stores carry each. Tells us the exact liquor label(s).
WITH stores AS (
  SELECT si.store_id, COALESCE(st.store_type, si.store_type) AS store_type
  FROM dim.dim_store_mercaso_store_info_full si
  LEFT JOIN ods.ods_gsheet_manually_collected_ums_store_type_full st
    ON st.store_id = si.store_id
   AND st.dt = (SELECT max(dt) FROM ods.ods_gsheet_manually_collected_ums_store_type_full)
  WHERE si.dt = (SELECT max(dt) FROM dim.dim_store_mercaso_store_info_full)
  GROUP BY 1, 2
)
SELECT store_type, count(DISTINCT store_id) AS stores
FROM stores
GROUP BY 1
ORDER BY 2 DESC;

-- D3. Order statuses, to know which orders count as real sales.
SELECT order_status, fulfillment_status, payment_status,
       count(*) AS orders, count_if(cancelled_at IS NOT NULL) AS cancelled
FROM dwm.dwm_trade_order_detail_full
WHERE dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
GROUP BY 1, 2, 3
ORDER BY 4 DESC;

-- D4. Does line-item sku join to the item table's sku_number (or item_id)?
WITH items AS (
  SELECT sku_number, item_id FROM dim.dim_item_item_info_full
  WHERE dt = (SELECT max(dt) FROM dim.dim_item_item_info_full)
),
skus AS (
  SELECT DISTINCT sku FROM dwm.dwm_trade_line_item_detail_full
  WHERE dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
)
SELECT count(*) AS line_skus,
       count_if(sku IN (SELECT sku_number FROM items)) AS match_sku_number,
       count_if(sku IN (SELECT item_id FROM items)) AS match_item_id
FROM skus;

-- D5. What one line's quantity means: cases or single units? Compare the amounts with
--     individual_price x package_size. Twenty recent lines is enough.
SELECT li.sku, li.title, li.package_type, li.package_size, li.current_quantity,
       li.individual_price, li.current_total_amount,
       li.current_total_amount / nullif(li.current_quantity, 0) AS amount_per_quantity
FROM dwm.dwm_trade_line_item_detail_full li
WHERE li.dt = (SELECT max(dt) FROM dwm.dwm_trade_line_item_detail_full)
  AND li.current_quantity > 0
ORDER BY li.order_item_created_at DESC
LIMIT 20;

-- D6. UPC types and the most common item attributes (where size and flavor may live).
SELECT 'upc_type' AS what, u.upc_type AS name, count(*) AS n
FROM dim.dim_item_item_info_full CROSS JOIN UNNEST(upc_ls) AS t(u)
WHERE dt = (SELECT max(dt) FROM dim.dim_item_item_info_full)
GROUP BY 1, 2
UNION ALL
SELECT 'attribute', a.attribute_name || coalesce(' [' || a.unit || ']', ''), count(*)
FROM dim.dim_item_item_info_full CROSS JOIN UNNEST(attribute_ls) AS t(a)
WHERE dt = (SELECT max(dt) FROM dim.dim_item_item_info_full)
GROUP BY 1, 2
ORDER BY 1, 3 DESC;

-- D7. Item status values, to decide what counts as sellable.
SELECT sales_status, availability_status, count_if(deleted_at IS NULL) AS live, count(*) AS total
FROM dim.dim_item_item_info_full
WHERE dt = (SELECT max(dt) FROM dim.dim_item_item_info_full)
GROUP BY 1, 2
ORDER BY 4 DESC;
