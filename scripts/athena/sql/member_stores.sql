-- Export: every store in the membership program with an ACTIVE membership in the latest snapshot,
-- plus every CA liquor store that is not a member (the comparison group), for
-- `pnpm member-discount`. Save the result as data/raw/member_stores.csv (gitignored: member lists
-- stay out of git). No store names or contact details are exported, only ids.
--
-- Members: Rick's rule, an ACTIVE row in the latest dt of ods.ods_backend_core_membership_full.
-- The timeline columns let the script flag ACTIVE rows to double-check:
--   newer_inactive_row  the store also has a CANCELLED or SUSPENDED membership updated after the
--                       ACTIVE one (the latest status is not ACTIVE)
--   expires_at          the ACTIVE row's period end; before today means the renewal is not in yet
--   cancel_at_period_end  the member asked to leave at the end of the period
-- Store type: the same rule as the catalog work (manual sheet first, then the store record).
-- Orders: not cancelled, CA only; orders_90d decides whether a store ordered in the window.
WITH snapshot AS (
  SELECT * FROM ods.ods_backend_core_membership_full
  WHERE dt = (SELECT max(dt) FROM ods.ods_backend_core_membership_full)
),
active AS (
  SELECT store_id, min(started_at) AS member_since, max(expires_at) AS expires_at,
         max(updated_at) AS updated_at, bool_or(coalesce(cancel_at_period_end, false)) AS cancel_at_period_end
  FROM snapshot
  WHERE status = 'ACTIVE'
  GROUP BY store_id
),
inactive AS (
  SELECT store_id, max(updated_at) AS updated_at
  FROM snapshot
  WHERE status <> 'ACTIVE'
  GROUP BY store_id
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
scope AS (
  SELECT s.store_id, s.store_type FROM stores s WHERE s.store_type = 'Liquor store'
  UNION
  SELECT a.store_id, s.store_type FROM active a LEFT JOIN stores s ON s.store_id = a.store_id
),
orders AS (
  SELECT o.store_id,
         CAST(max(o.created_at) AS date) AS last_order_date,
         count(DISTINCT CASE WHEN o.created_at >= date_add('day', -90, current_timestamp) THEN o.order_id END) AS orders_90d
  FROM dwm.dwm_trade_order_detail_full o
  JOIN scope sc ON sc.store_id = o.store_id
  WHERE o.dt = (SELECT max(dt) FROM dwm.dwm_trade_order_detail_full)
    AND o.cancelled_at IS NULL
    AND o.created_at >= date_add('month', -12, current_timestamp)
    AND coalesce(o.shipping_province_code, 'CA') = 'CA'
  GROUP BY o.store_id
)
SELECT
  sc.store_id,
  coalesce(sc.store_type, '') AS store_type,
  CASE WHEN a.store_id IS NOT NULL THEN 'yes' ELSE 'no' END AS member,
  CAST(a.member_since AS date) AS member_since,
  CAST(a.expires_at AS date) AS expires_at,
  CASE WHEN a.cancel_at_period_end THEN 'yes' ELSE '' END AS cancel_at_period_end,
  CASE WHEN i.updated_at > a.updated_at THEN 'yes' ELSE '' END AS newer_inactive_row,
  o.last_order_date,
  coalesce(o.orders_90d, 0) AS orders_90d,
  current_date AS as_of
FROM scope sc
LEFT JOIN active a ON a.store_id = sc.store_id
LEFT JOIN inactive i ON i.store_id = sc.store_id
LEFT JOIN orders o ON o.store_id = sc.store_id
WHERE a.store_id IS NOT NULL OR o.store_id IS NOT NULL
ORDER BY sc.store_id;
