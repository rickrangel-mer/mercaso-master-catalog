// Copies the built catalogs (dist/*.json at the repo root) into public/data and writes
// public/data/index.json listing them. Run `pnpm build` at the repo root first.
//
// If data/raw/pricing.csv exists (`pnpm athena:export pricing`), it also writes
// public/data/prices.json with today's price, average cost and margin for the SKUs the catalogs
// use. Both folders are gitignored, so prices and costs stay out of git; the site shows the
// price columns only when this file is present.
//
// If dist/stores/liquor.json exists (`pnpm stores`), it is copied to public/data/stores.json for
// the Stores tab. It holds store names and spend, so it stays out of git the same way.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "../../../dist");
const pricingCsv = join(here, "../../../data/raw/pricing.csv");
const out = join(here, "../public/data");

const files = existsSync(dist) ? readdirSync(dist).filter((f) => f.endsWith(".json")).sort() : [];
if (files.length === 0) {
  console.error("No catalogs in dist/. Run `pnpm build` at the repo root first.");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const index = files.map((f) => {
  copyFileSync(join(dist, f), join(out, f));
  const { store_type, name } = JSON.parse(readFileSync(join(dist, f), "utf8"));
  return { store_type, name, file: f };
});
writeFileSync(join(out, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`Copied ${files.length} catalog(s) to public/data.`);

// Prices: one entry per SKU the catalogs reference.
if (existsSync(pricingCsv)) {
  const skus = new Set();
  const walk = (n) => {
    for (const s of n.match?.skus ?? []) skus.add(s.sku);
    (n.children ?? []).forEach(walk);
  };
  for (const f of files) JSON.parse(readFileSync(join(dist, f), "utf8")).departments.forEach(walk);
  const [head, ...lines] = readFileSync(pricingCsv, "utf8").trim().split("\n");
  const cols = head.split(",");
  const at = (name) => cols.indexOf(name);
  const prices = {};
  let costDate = "";
  for (const line of lines) {
    const v = line.split(",");
    const sku = v[at("sku_number")];
    if (!skus.has(sku)) continue;
    const price = Number(v[at("price")]);
    const cost = v[at("average_cost")] === "" ? undefined : Number(v[at("average_cost")]);
    if (!(price > 0)) continue;
    prices[sku] = {
      price,
      promo: v[at("price_type")] === "PROMO",
      ...(cost !== undefined ? { cost: Math.round(cost * 100) / 100, margin: Math.round(((price - cost) / price) * 10000) / 10000 } : {}),
    };
    costDate ||= v[at("cost_dt")] ?? "";
  }
  writeFileSync(join(out, "prices.json"), `${JSON.stringify({ as_of: costDate, prices })}\n`);
  console.log(`Wrote prices for ${Object.keys(prices).length} of ${skus.size} SKUs to public/data/prices.json.`);
} else {
  console.log("No data/raw/pricing.csv; the site will build without prices.");
}

// Store view.
const storesJson = join(dist, "stores/liquor.json");
if (existsSync(storesJson)) {
  copyFileSync(storesJson, join(out, "stores.json"));
  console.log("Copied the store view to public/data/stores.json.");
} else {
  console.log("No dist/stores/liquor.json; the Stores tab will say how to build it.");
}
