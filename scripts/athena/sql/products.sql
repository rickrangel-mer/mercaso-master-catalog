-- Export: Mercaso product catalog, for matching catalog leaves to SKUs (Phase 4).
-- Save the result as data/raw/products.csv (gitignored).
--
-- One row per live item from the latest snapshot. No prices or costs: matching does not need
-- them. Arrays are flattened to "|"-separated strings so the CSV stays one row per item.
-- Assumes: dt is a daily full snapshot (discovery D1); UPC types say "each" or "case" (D6).
-- If D1 shows more than one tenant_id, add: AND i.tenant_id = '<mercaso tenant>'.
SELECT
  i.sku_number,
  i.item_id,
  i.brand_id,
  i.brand_name,
  i.name,
  i.title,
  i.new_description,
  i.detail,
  i.package_type,
  i.package_size,
  i.item_type,
  i.department,
  i.category,
  i.sub_category,
  i.clazz,
  i.sales_status,
  i.availability_status,
  array_join(transform(filter(i.upc_ls, u -> lower(u.upc_type) LIKE '%each%'), u -> u.upc_number), '|') AS each_upcs,
  array_join(transform(filter(i.upc_ls, u -> lower(u.upc_type) LIKE '%case%'), u -> u.upc_number), '|') AS case_upcs,
  array_join(transform(i.upc_ls, u -> u.upc_type || ':' || u.upc_number), '|') AS all_upcs,
  array_join(
    transform(i.attribute_ls, a -> a.attribute_name || '=' || coalesce(a.value, '') || coalesce(' ' || a.unit, '')),
    '|'
  ) AS attributes,
  array_join(i.tag_ls, '|') AS tags,
  i.primary_image
FROM dim.dim_item_item_info_full i
WHERE i.dt = (SELECT max(dt) FROM dim.dim_item_item_info_full)
  AND i.deleted_at IS NULL
ORDER BY i.department, i.category, i.sub_category, i.brand_name, i.sku_number;
