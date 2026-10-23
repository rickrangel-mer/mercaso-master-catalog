-- Export: Mercaso's map region per ZIP code, for `pnpm market` (docs/exploration/market.md). Save as
-- data/raw/market_zips.csv. A ZIP's region is the one most of its stores carry in the store
-- segmentation table; `pnpm market` places ZIPs with no segmented store by their neighbours.
WITH seg AS (
  SELECT substr(trim(postal_code), 1, 5) AS zip, region, count(DISTINCT store_id) AS n
  FROM ads.ads_store_segmentation_four_week_rolling_store_detail_inc
  WHERE dt = (SELECT max(dt) FROM ads.ads_store_segmentation_four_week_rolling_store_detail_inc)
    AND region IS NOT NULL AND region NOT IN ('UNKNOWN', '')
  GROUP BY 1, 2
),
ranked AS (
  SELECT zip, region, n, row_number() OVER (PARTITION BY zip ORDER BY n DESC, region) AS k FROM seg
)
SELECT zip, region, n AS stores FROM ranked WHERE k = 1 ORDER BY 1;
