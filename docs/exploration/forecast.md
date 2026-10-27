# Forecast tab — the last 12 months and the next 12

Started 2026-10-27 (Rick): another way to look at what the other tabs measure, as monthly series with a 12-month forecast inside the same charts, and the assumptions behind it on sliders.

## Definitions (Rick, 2026-10-27)

| Term | Definition |
|---|---|
| Customer | A CA store that ordered in the last 90 days (any store type) |
| New | First order ever in the month (as on the Acquisition tab) |
| Saved | Ordered again after 45 to 89 days without an order (it was at risk) |
| Churned | Reached 90 days without an order, counted in the month of that 90th day |
| Won back | Ordered again after 90+ days (a churned store came back) |
| Save rate | Saved ÷ (saved + churned) in the month |
| Win-back rate | Won back ÷ churned stores at the month's start |
| AOV, units, SKU lines per order | Sales, cases and order lines (an order × a SKU) ÷ orders, every order in the month |

Customers at a month's end = at its start + new + won back − churned; the history reconciles exactly every month.

## The forecast

1. **Drivers**, each from its own last 12 months: new customers a month, won back a month, the share of customers going 45 days without an order, the save rate, orders per customer, AOV, units per order and SKU lines per order.
2. **Shape and level.** A straight line is fitted to each driver's 12 months. *Today's level* holds the line's last value; *the trend continued* extends it. *Last year's pattern* gives each forecast month the same place against the line as that calendar month had last year (so months rise and fall as they did); *a straight line* drops the pattern.
3. **Adjustments**: each slider multiplies its driver by 1 ± up to 50% (140 new customers a month at +5% is 147). Each slider sits above the chart it drives (Rick, 2026-10-27): new customers, churned (the at-risk share), save rate, won back, AOV, orders (orders per customer), units and SKU lines per order; customers, saved, sales and SKU lines follow from them.
4. **Customers** are simulated month by month: at risk = customers × the at-risk share; saved = at risk × save rate; churned = the rest; won back from its own forecast (a rate on the growing pool of churned stores overstated it, since stores that churned long ago rarely come back); customers' = customers + new + won back − churned.
5. Orders = customers × orders per customer; sales, units and SKU lines = orders × AOV, units and lines per order.

The totals on the right (sales, SKU lines, units, customers, new customers) give the next 6 and 12 months against the last 6 and 12 (customers: in 6 and 12 months against today).

**Read with care.** Twelve months can't separate a season from a one-off step: AOV and lines per order jumped in March 2026, so with last year's pattern the forecast dips through the winter and jumps again in March. The straight-line view reads those without the step.

## First run (2026-10-27, all stores, last year's pattern from today's level)

History October 2025 to September 2026: 1,657 new customers, customers 3,627 → 4,207, save rate about 50%. The next 12 months: customers about 5,030 by September 2027, about 2,110 new; SKU lines and units up about 28–30% on the last 12, mostly from today's order size (AOV, units and lines per order rose through the year) held for a full year. Dollar figures are on the site only.

## Building it

```
pnpm athena:export market-stores market-store-days forecast-store-months
pnpm forecast   # dist/forecast/forecast.json (gitignored) and a monthly printout with the accounting check
pnpm web:html
```

- `forecast_store_months.sql`: per store and month since October 2025, orders, sales, units and order lines.
- `scripts/forecast/` turns each store's order days into its events and the monthly flows per rep × store type (reps by ZIP, untyped stores spread as on the Market tab). `apps/web/lib/forecast.ts` (tests beside it) is the model the tab runs; `apps/web/components/ForecastView.tsx` the tab, with store type and rep filters and Download CSV. The data pack adds `screens/forecast_by_month.csv`.
