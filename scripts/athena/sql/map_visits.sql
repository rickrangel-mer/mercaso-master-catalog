-- Export: where sales reps logged store visits, for placing prospects on the slide 3 street map
-- (scripts/slides/gap_map.py). Save as data/raw/map_visits.csv (gitignored). One row per VISIT with GPS
-- in the last 12 months: the store's CRM id and name (to match Rick's prospect list, which has names
-- and ZIPs but no address), whether it has ever ordered, and where the visit was logged. Visits carry
-- the rep's GPS, not the store's address. No notes or contact details.
SELECT
  i.store_id,
  i.store_name,
  CASE WHEN i.first_order_date IS NOT NULL THEN 1 ELSE 0 END AS has_ordered,
  i.interaction_latitude AS lat,
  i.interaction_longitude AS lng,
  CAST(i.interaction_at AS date) AS visit_date
FROM ads.ads_crm_sales_rep_store_interaction_detail_full i
WHERE i.dt = (SELECT max(dt) FROM ads.ads_crm_sales_rep_store_interaction_detail_full)
  AND i.type = 'VISIT'
  AND i.interaction_latitude IS NOT NULL
  AND i.interaction_longitude IS NOT NULL
  AND i.interaction_at >= date_add('month', -12, current_timestamp);
