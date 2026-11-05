-- Export: where sales reps logged store visits, for the market-gaps map (scripts/slides). Save as
-- data/raw/map_visits.csv. One row per VISIT with GPS in the last 12 months: where it was logged,
-- the store it was for, the store's CRM status at the visit (blank for a prospect), and whether the
-- store has ever ordered. No names, notes or contact details.
SELECT
  i.store_id,
  coalesce(i.store_status, '') AS store_status,
  CASE WHEN i.first_order_date IS NOT NULL THEN 1 ELSE 0 END AS has_ordered,
  substr(trim(coalesce(i.postal_code, '')), 1, 5) AS zip,
  i.interaction_latitude AS lat,
  i.interaction_longitude AS lng,
  CAST(i.interaction_at AS date) AS visit_date
FROM ads.ads_crm_sales_rep_store_interaction_detail_full i
WHERE i.dt = (SELECT max(dt) FROM ads.ads_crm_sales_rep_store_interaction_detail_full)
  AND i.type = 'VISIT'
  AND i.interaction_latitude IS NOT NULL
  AND i.interaction_longitude IS NOT NULL
  AND i.interaction_at >= date_add('month', -12, current_timestamp);
