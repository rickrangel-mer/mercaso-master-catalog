/**
 * A data pack for cross-checking the site (docs/exploration/datapack.md): the tables behind the
 * Wallet, Market and Acquisition tabs at the site's default settings, the raw Athena exports they
 * are built from, the SQL, the zone file and a README. Reads the gitignored base files
 * (dist/wallet, dist/market, dist/acquisition; `pnpm wallet market acquisition` first) and
 * data/raw/. Writes dist/datapack/mercaso-data-pack-<date>/ and a .zip of it (gitignored: the pack
 * holds sales, prices, costs and store names).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { series } from "../../apps/web/lib/acquisition.ts";
import { acquisitionRows, forecastRows, marketRows, toCsv, walletRows } from "../../apps/web/lib/exportTables.ts";
import { computeForecast, DEFAULT_FORECAST } from "../../apps/web/lib/forecast.ts";
import { computeMarket, groupNames } from "../../apps/web/lib/market.ts";
import { computeWallet, DEFAULT_SETTINGS } from "../../apps/web/lib/wallet.ts";

const ROOT = process.cwd();
const date = new Date().toISOString().slice(0, 10);
const name = `mercaso-data-pack-${date}`;
const OUT = join(ROOT, "dist/datapack", name);
const json = (file: string) => {
  const path = join(ROOT, file);
  if (!existsSync(path)) {
    console.error(`${file} is missing. Run pnpm wallet, pnpm market and pnpm acquisition first.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8"));
};
rmSync(OUT, { recursive: true, force: true });
for (const d of ["screens", "raw", "sql", "config"]) mkdirSync(join(OUT, d), { recursive: true });

// 1. The screens at their default settings (as the site opens).
const wallet = json("dist/wallet/wallet.json");
const nulls = (n: number) => Array.from({ length: n }, () => null);
const G = wallet.groups.length;
const walletResult = computeWallet(wallet, { ...DEFAULT_SETTINGS, priorities: ["must"], shortTerm: nulls(G), longTerm: nulls(G), basis: "skus", shortSkus: nulls(G), longSkus: nulls(G) });
writeFileSync(join(OUT, "screens/wallet_by_department.csv"), toCsv(walletRows(wallet, walletResult)));
const market = json("dist/market/market.json");
const n = groupNames(market, "zone").length;
const marketResult = computeMarket(market, { driver: "zone", spend: "average", newShort: nulls(n), newLong: nulls(n), backShort: nulls(n), backLong: nulls(n) });
writeFileSync(join(OUT, "screens/market_by_group.csv"), toCsv(marketRows(market, marketResult)));
const acquisition = json("dist/acquisition/acquisition.json");
const acq = series(acquisition, []);
writeFileSync(join(OUT, "screens/acquisition_by_rep_month.csv"), toCsv(acquisitionRows(acquisition, acq.reps, acq.total)));
const forecastPath = join(ROOT, "dist/forecast/forecast.json");
const forecast = existsSync(forecastPath) ? JSON.parse(readFileSync(forecastPath, "utf8")) : null;
if (forecast) writeFileSync(join(OUT, "screens/forecast_by_month.csv"), toCsv(forecastRows(forecast, computeForecast(forecast, DEFAULT_FORECAST))));

// 2. The raw exports, the SQL and the zone file.
const RAW = [
  ["wallet_stores.csv", "wallet-stores", "Wallet: per store, last order and orders at today's date and a year before"],
  ["wallet_store_dept.csv", "wallet-store-dept", "Wallet: per store, window (now/then) and Mercaso department: spend, catalog spend, distinct SKUs, catalog SKUs, order lines"],
  ["wallet_store_skus.csv", "wallet-store-skus", "Wallet: per store and catalog SKU, last purchase up to each date and cases in 12 months (catalog penetration)"],
  ["pricing.csv", "pricing", "Price and average cost per SKU (margins)"],
  ["market_stores.csv", "market-stores", "Market and Acquisition: every CA store that ordered in 24 months, with type, ZIP, name, first/last order and spend"],
  ["market_zips.csv", "market-zips", "Market: Mercaso map region per ZIP"],
  ["market_store_days.csv", "market-store-days", "Acquisition: the days each store ordered since 2025-03-01"],
  ["forecast_store_months.csv", "forecast-store-months", "Forecast: per store and month, orders, sales, units and order lines"],
  ["prospects.csv", "", "The sales prospect list (as shared by Rick)"],
] as const;
const SQL: Record<string, string> = {
  "wallet-stores": "wallet_stores.sql",
  "wallet-store-dept": "wallet_store_dept.sql",
  "wallet-store-skus": "wallet_store_skus.sql",
  pricing: "pricing.sql",
  "market-stores": "market_stores.sql",
  "market-zips": "market_zips.sql",
  "market-store-days": "market_store_days.sql",
  "forecast-store-months": "forecast_store_months.sql",
};
const included: string[] = [];
for (const [file, exp] of RAW) {
  const src = join(ROOT, "data/raw", file);
  if (!existsSync(src)) continue;
  copyFileSync(src, join(OUT, "raw", file));
  included.push(file);
  if (exp) copyFileSync(join(ROOT, "scripts/athena/sql", SQL[exp]!), join(OUT, "sql", SQL[exp]!));
}
copyFileSync(join(ROOT, "data/market/zones.yaml"), join(OUT, "config/zones.yaml"));

// 3. README.
const mb = (f: string) => `${(statSync(join(OUT, f)).size / 1e6).toFixed(1)} MB`;
const raw = RAW.filter(([f]) => included.includes(f));
const readme = `# Mercaso Master Catalog: data pack (${date})

The data behind the site's **Wallet**, **Market** and **Acquisition** tabs, for cross-checking. **Internal only:** it holds sales, prices, costs, store names and the prospect list.

Data dates: Wallet ${wallet.as_of} (against ${wallet.then_as_of}); Market ${market.as_of}; Acquisition ${acquisition.months[0].slice(0, 7)} to ${acquisition.as_of}.

## screens/: the tabs at their default settings

These are what the tabs show when the site opens (and what each tab's **Download CSV** button exports, with your own settings, from the site). Rates are fractions (0.2150 = 21.5%); money is yearly dollars unless the column says per order.

| File | One row per | Defaults |
|---|---|---|
| \`wallet_by_department.csv\` | department, plus a total | All store types; targets in any SKU; short term closes a third of each store's gap to the best stores of its kind (top 25%), long term two thirds; reality check on |
| \`market_by_group.csv\` | zone, sub-area, store type and rep, plus the total | Targets by zone at last year's pace of new stores, no win-backs; a new store spends like the average store of its type |
| \`acquisition_by_rep_month.csv\` | rep and month, plus all reps | All store types |
| \`forecast_by_month.csv\` | month: the last 12 and the next 12 | All store types and reps; months follow last year's pattern from today's level; no adjustments |

Store counts can have decimals: a store with no type, and a prospect whose name doesn't say its type, are spread over the store types in proportion (so totals stay whole, per-type counts don't).

## raw/: the Athena exports and the prospect list

| File | Size | What it is | Query |
|---|---|---|---|
${raw.map(([f, e, d]) => `| \`${f}\` | ${mb(`raw/${f}`)} | ${d} | ${e ? `\`sql/${SQL[e]}\`` : "–"} |`).join("\n")}

## How the numbers are made

**Wallet** (method: \`docs/exploration/wallet.md\` in the repo)
- Active store: ordered in the last 45 days. Snapshots: the 90 days to ${wallet.as_of} and the 90 days to ${wallet.then_as_of}.
- Dollars per order (department) = spend ÷ orders over active stores (\`wallet_store_dept\` spend, \`wallet_stores\` orders). SKUs per order = order lines ÷ orders.
- SKUs per store = distinct SKUs bought in 90 days, averaged over active stores. Best stores = the top quarter of each store type × order-frequency group by catalog coverage.
- New SKUs: each store closes a share of its gap to its best stores' SKU count; each extra SKU is worth what an added catalog item is worth on average (yearly spend of similar stores already buying it, × the back-test factors). Their dollars per order = the yearly gain ÷ a year of today's orders; as SKU lines, ÷ the department's dollars per line today.

**Market** (\`docs/exploration/market.md\`)
- Market = active stores + stores that stopped ordering in the last 12 months + the prospect list. Penetration = active ÷ market.
- Zone and sub-area: Mercaso's map region of the store's ZIP (\`market_zips\`), grouped into zones by \`config/zones.yaml\`. Rep: from the prospect list; a customer takes the rep who owns its ZIP.
- A new store spends what today's active stores of its type spend, in today's mix of order frequency; a won-back store returns with its last year of business (giants capped at the 95th percentile).

**Acquisition** (\`docs/exploration/acquisition.md\`)
- Acquired = first order in the month. Prospects at a month's start = the prospect list + every store acquired that month or later. Acquisition rate = acquired ÷ prospects at the start.
- Penetration = stores active at the month's end (ordered in the 45 days before, \`market_store_days\`) ÷ the rep's market (prospect list + every store that ordered in 24 months).

## Reproducing it

The SQL in \`sql/\` runs in Athena as is (the repo's runner fills \`{{CATALOG_SKUS}}\` in the Wallet queries with the approved catalog SKUs). In the repo: \`pnpm athena:export …\`, then \`pnpm wallet\`, \`pnpm market\`, \`pnpm acquisition\` and \`pnpm datapack\`.
`;
writeFileSync(join(OUT, "README.md"), readme);

// 4. Zip it.
const zip = join(ROOT, "dist/datapack", `${name}.zip`);
rmSync(zip, { force: true });
execFileSync("zip", ["-qr", `${name}.zip`, name], { cwd: join(ROOT, "dist/datapack") });
console.log(`Wrote dist/datapack/${name}/ (${included.length} raw files) and ${name}.zip (${(statSync(zip).size / 1e6).toFixed(1)} MB).`);
