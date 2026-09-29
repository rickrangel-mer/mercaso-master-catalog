-- Export: Mercaso product catalog, for matching catalog leaves to SKUs (Phase 4).
-- Save the result as data/raw/products.csv (gitignored).
--
-- One row per live item from the latest snapshot (the latest dt holds full history). No prices
-- or costs: matching does not need them. Arrays are flattened to "|"-separated strings so the
-- CSV stays one row per item.
-- UPCs: types are EACH_UPC and CASE_UPC. The same code often appears with and without a
-- leading zero (UPC-A vs EAN-13), so leading zeros are stripped and duplicates dropped.
-- Attributes: "Item size", "Bottle Size" and "Flavor" get their own columns for matching; the
-- full list is kept in `attributes` as name=value unit.
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
  array_join(array_distinct(transform(
    filter(i.upc_ls, u -> u.upc_type = 'EACH_UPC'), u -> regexp_replace(u.upc_number, '^0+', '')
  )), '|') AS each_upcs,
  array_join(array_distinct(transform(
    filter(i.upc_ls, u -> u.upc_type = 'CASE_UPC'), u -> regexp_replace(u.upc_number, '^0+', '')
  )), '|') AS case_upcs,
  element_at(filter(i.attribute_ls, a -> a.attribute_name = 'Item size'), 1).value AS item_size,
  element_at(filter(i.attribute_ls, a -> a.attribute_name = 'Item size'), 1).unit AS item_size_unit,
  element_at(filter(i.attribute_ls, a -> a.attribute_name = 'Bottle Size'), 1).value AS bottle_size,
  element_at(filter(i.attribute_ls, a -> a.attribute_name = 'Bottle Size'), 1).unit AS bottle_size_unit,
  element_at(filter(i.attribute_ls, a -> a.attribute_name = 'Flavor'), 1).value AS flavor,
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
