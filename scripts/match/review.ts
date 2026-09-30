/**
 * Review sheets for the liquor matches.
 *
 *   pnpm review export   write docs/review/liquor-pending.csv and docs/review/liquor-gaps.csv
 *   pnpm review import   apply what was filled in to data/matches/liquor.csv
 *
 * Pending sheet: put approve or reject in `decision` (blank = not decided yet).
 * Gap sheet: write one or more Mercaso SKUs in `mercaso_sku`; each is added as a manual,
 * approved match. SKUs are checked against data/raw/products.csv when it exists.
 * After an import, run `pnpm match` (refreshes store shares) and `pnpm gaps`, then export again.
 * Reviewer defaults to "rick"; set REVIEWER to change it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { toCsv } from "../athena/lib.ts";
import { loadCatalog } from "../lib/load.ts";
import { MATCH_COLUMNS, summarizeMatches } from "../lib/matches.ts";
import { buildCatalogJson } from "../lib/output.ts";
import { applyReview, gapSheet, leafInfo, pendingSheet, type MatchRecord, type Product } from "./review-lib.ts";

const ROOT = process.cwd();
const MATCH_FILE = join(ROOT, "data/matches/liquor.csv");
const PENDING = join(ROOT, "docs/review/liquor-pending.csv");
const GAPS = join(ROOT, "docs/review/liquor-gaps.csv");
// A byte-order mark so Excel opens the files as UTF-8 (›, accents).
const BOM = "﻿";

const readCsv = (path: string): Record<string, string>[] => parse(readFileSync(path, "utf8"), { columns: true, bom: true, skip_empty_lines: true });

const { storeTypes } = loadCatalog(ROOT);
const liquor = storeTypes.find((s) => s.resolved.def.store_type === "liquor");
if (!liquor) throw new Error("store type liquor not found");
const leaves = leafInfo(buildCatalogJson(liquor.resolved, summarizeMatches([], liquor.resolved)).departments);
const matches = readCsv(MATCH_FILE) as MatchRecord[];

const command = process.argv[2] ?? "export";
if (command === "export") {
  mkdirSync(join(ROOT, "docs/review"), { recursive: true });
  const pending = pendingSheet(leaves, matches);
  const gaps = gapSheet(leaves, matches);
  writeFileSync(PENDING, BOM + toCsv(pending));
  writeFileSync(GAPS, BOM + toCsv(gaps));
  const items = new Set(pending.slice(1).map((r) => r.at(-1))).size;
  console.log(`wrote docs/review/liquor-pending.csv: ${pending.length - 1} pending matches on ${items} items`);
  console.log(`wrote docs/review/liquor-gaps.csv: ${gaps.length - 1} items with no Mercaso SKU`);
} else if (command === "import") {
  const productsFile = join(ROOT, "data/raw/products.csv");
  const products = existsSync(productsFile)
    ? new Map<string, Product>(
        readCsv(productsFile).map((r) => [
          (r.sku_number ?? "").toUpperCase(),
          { sku: r.sku_number ?? "", title: r.title ?? "", casePack: String(Math.max(1, Math.round(Number(r.package_size) || 1))), active: r.availability_status === "ACTIVE" },
        ]),
      )
    : null;
  if (!products) console.warn("data/raw/products.csv is missing, so gap SKUs are added without a title or check. Run pnpm athena:export products first if you can.");
  const reviewer = process.env.REVIEWER || "rick";
  const date = new Date().toISOString().slice(0, 10);
  const result = applyReview(
    matches,
    existsSync(PENDING) ? readCsv(PENDING) : [],
    existsSync(GAPS) ? readCsv(GAPS) : [],
    products,
    reviewer,
    date,
  );
  writeFileSync(MATCH_FILE, toCsv([[...MATCH_COLUMNS], ...result.matches.map((m) => MATCH_COLUMNS.map((c) => m[c] ?? ""))]));
  console.log(`data/matches/liquor.csv: ${result.approved} approved, ${result.rejected} rejected, ${result.added} SKUs added from the gap sheet.`);
  for (const p of result.problems) console.log(`  ! ${p}`);
  console.log("Next: pnpm match && pnpm gaps && pnpm review export");
} else {
  console.error(`Unknown command "${command}". Use export or import.`);
  process.exit(1);
}
