-- Optional checks. Not needed to run the exports; useful when tuning the matcher.

-- C1. Every item attribute name and unit, most common first. Shows what else could become a
--     column in products.sql beside Item size, Bottle Size and Flavor.
SELECT a.attribute_name, a.attribute_format, a.unit, count(*) AS items
FROM dim.dim_item_item_info_full CROSS JOIN UNNEST(attribute_ls) AS t(a)
WHERE dt = (SELECT max(dt) FROM dim.dim_item_item_info_full)
  AND deleted_at IS NULL
GROUP BY 1, 2, 3
ORDER BY 4 DESC;

-- C2. Item status values, to decide whether products.sql should drop inactive items.
SELECT sales_status, availability_status, count(*) AS items
FROM dim.dim_item_item_info_full
WHERE dt = (SELECT max(dt) FROM dim.dim_item_item_info_full)
  AND deleted_at IS NULL
GROUP BY 1, 2
ORDER BY 3 DESC;
