// Builds the whole site as one self-contained HTML file that opens from disk (double-click, no
// server): code, styles and data are inlined. Run `pnpm web:html` at the repo root.
//
//   dist/site/mercaso-liquor-catalog-<date>.html            with price and margin (if data/raw/pricing.csv exists)
//   dist/site/mercaso-liquor-catalog-<date>-no-prices.html  without them, for audiences that should not see costs
//
// dist/ is gitignored. The priced file contains prices and costs: share it privately.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const data = join(web, "public/data");
const outDir = join(web, "../../dist/site");

const { outputFiles } = await build({
  entryPoints: [join(web, "single/main.tsx")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "error",
});
const js = outputFiles[0].text;
const css = readFileSync(join(web, "app/globals.css"), "utf8");

const read = (f) => JSON.parse(readFileSync(join(data, f), "utf8"));
const index = read("index.json");
const catalogs = Object.fromEntries(index.map((e) => [`data/${e.file}`, read(e.file)]));
const prices = existsSync(join(data, "prices.json")) ? read("prices.json") : null;
const stores = existsSync(join(data, "stores.json")) ? read("stores.json") : null;
// The no-prices file must not carry prices, margins, spend or opportunity in the store view either.
const storesWithoutMoney = (f) => ({
  ...f,
  items: f.items.map(({ price, promo, margin, ...rest }) => ({ ...rest, opportunity: 0 })),
  stores: f.stores.map((s) => ({ ...s, spend_12m: 0, opportunity: 0 })),
});
const today = new Date().toISOString().slice(0, 10);
const snapshot = prices?.as_of || today;

// Inline JSON and JS safely inside <script>. In JSON every "<" can be escaped; in the code only a
// closing tag can end the script early, and "<\/" means the same in any string or regex.
const safeJson = (s) => s.replace(/</g, "\\u003c");
const safeJs = (s) => s.replace(/<\/(script)/gi, "<\\/$1");
const page = (withPrices) => {
  const embedded = {
    "data/index.json": index,
    ...catalogs,
    snapshot,
    ...(withPrices && prices ? { "data/prices.json": prices } : {}),
    ...(stores ? { "data/stores.json": withPrices ? stores : storesWithoutMoney(stores) } : {}),
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Master Catalog</title>
<meta name="description" content="What each Mercaso store type should carry, and the Mercaso SKUs that fill it. Snapshot ${snapshot}.">
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>window.__MERCASO_DATA__ = ${safeJson(JSON.stringify(embedded))};</script>
<script>${safeJs(js)}</script>
</body>
</html>
`;
};

mkdirSync(outDir, { recursive: true });
const base = join(outDir, `mercaso-liquor-catalog-${snapshot}`);
const written = [];
if (prices) {
  writeFileSync(`${base}.html`, page(true));
  written.push(`${base}.html`);
}
writeFileSync(`${base}-no-prices.html`, page(false));
written.push(`${base}-no-prices.html`);
for (const f of written) console.log(`wrote ${relative(process.cwd(), f)} (${(readFileSync(f).length / 1e6).toFixed(1)} MB)`);
if (!prices) console.log("No prices: run `pnpm athena:export pricing` for the priced version.");
