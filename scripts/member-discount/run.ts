/**
 * Member discounts for the liquor master catalog. Reads data/raw/member_stores.csv,
 * member_store_skus.csv and pricing.csv (`pnpm athena:export pricing member-stores
 * member-store-skus`). Writes, under the gitignored dist/member-discount/:
 *   liquor.csv          one row per approved SKU of a scored item: member penetration
 *                       (liquor-store members, 90 days, per catalog item), non-member and all-member
 *                       penetration for context, band, price, cost, margins, discount and the
 *                       exclusion reason
 *   liquor-summary.md   SKUs per discount, how many failed the floor, and the program's cost at
 *                       current member volumes
 * Variants (`pnpm member-discount v2`):
 *   v1 (default)        must and should items → liquor.csv, liquor-summary.md
 *   v2                  must, should and nice items → liquor-v2.csv, liquor-v2-summary.md
 *   wave-1              the SKUs and discounts Rick approved to run first
 *                       (data/member-discount/liquor-wave-1.csv), re-checked against today's prices
 *                       and scoring → liquor-wave-1.csv, liquor-wave-1-summary.md
 * Prices, costs and member lists stay out of git.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { toCsv } from "../athena/lib.ts";
import { loadCatalog } from "../lib/load.ts";
import { summarizeMatches } from "../lib/matches.ts";
import { buildCatalogJson } from "../lib/output.ts";
import { leafInfo } from "../match/review-lib.ts";
import { checkWave, MARGIN_FLOOR, memberDiscounts, summarize, type SkuPrice, type SkuRow, type WaveRow } from "./lib.ts";
import type { Priority } from "../../apps/web/lib/score.ts";

const ROOT = process.cwd();
const OUT = join(ROOT, "dist/member-discount");
const WINDOW_DAYS = 90;
const STORE_TYPE = "Liquor store";
const VARIANTS: Record<string, { file: string; priorities: Priority[]; wave?: string }> = {
  v1: { file: "liquor", priorities: ["must", "should"] },
  v2: { file: "liquor-v2", priorities: ["must", "should", "nice"] },
  "wave-1": { file: "liquor-wave-1", priorities: ["must", "should", "nice"], wave: "data/member-discount/liquor-wave-1.csv" },
};
const variantName = process.argv[2] ?? "v1";
const variant = VARIANTS[variantName];
if (!variant) {
  console.error(`Unknown variant "${variantName}". Known: ${Object.keys(VARIANTS).join(", ")}.`);
  process.exit(1);
}
const priorityText = variant.priorities.join(", ").replace(/, ([^,]*)$/, " and $1");
const read = (file: string, hint: string): Record<string, string>[] => {
  const path = join(ROOT, file);
  if (!existsSync(path)) {
    console.error(`${file} is missing. ${hint}`);
    process.exit(1);
  }
  return parse(readFileSync(path, "utf8"), { columns: true });
};

const { storeTypes } = loadCatalog(ROOT);
const liquor = storeTypes.find((s) => s.resolved.def.store_type === "liquor");
if (!liquor) throw new Error("store type liquor not found");
const leaves = leafInfo(buildCatalogJson(liquor.resolved, summarizeMatches(liquor.matches, liquor.resolved)).departments);
const approved = read("data/matches/liquor.csv", "")
  .filter((r) => r.status === "approved")
  .map((r) => ({ node_id: r.node_id!, sku: r.mercaso_sku!, title: r.title ?? "", case_pack: r.case_pack ?? "", share_12m: Number(r.share_12m) || 0 }));
const hint = "Run pnpm athena:export pricing member-stores member-store-skus.";
const storeRows = read("data/raw/member_stores.csv", hint);
const skuRows = read("data/raw/member_store_skus.csv", hint);
const priceRows = read("data/raw/pricing.csv", hint);
if (priceRows[0] && !("member_discount" in priceRows[0])) {
  console.error("data/raw/pricing.csv has no member_discount column; rerun pnpm athena:export pricing.");
  process.exit(1);
}
const prices = new Map<string, SkuPrice>(
  priceRows.map((r) => [
    r.sku_number!,
    {
      price: Number(r.price),
      promo: r.price_type === "PROMO",
      regular_price: Number(r.regular_price),
      ...(r.average_cost === "" ? {} : { cost: Number(r.average_cost) }),
      member_discount: Number(r.member_discount) || 0,
    },
  ]),
);
const asOf = storeRows[0]?.as_of ?? new Date().toISOString().slice(0, 10);
const stores = storeRows.map((r) => ({
  store_id: r.store_id!,
  store_type: r.store_type ?? "",
  member: r.member === "yes",
  last_order_date: r.last_order_date ?? "",
  orders_90d: Number(r.orders_90d) || 0,
}));

const scored = memberDiscounts({
  asOf,
  leaves,
  approved,
  stores,
  storeSkus: skuRows.map((r) => ({ store_id: r.store_id!, sku: r.sku!, cases: Number(r.cases) || 0, last_order_date: r.last_order_date ?? "" })),
  prices,
  holds: liquor.resolved.def.supply_hold ?? {},
  storeType: STORE_TYPE,
  windowDays: WINDOW_DAYS,
  priorities: variant.priorities,
});
const wave = variant.wave
  ? checkWave(scored, read(variant.wave, "").map((r) => ({ sku: r.mercaso_sku!, discount: Number(r.discount) })))
  : undefined;
const rows: (SkuRow | WaveRow)[] = wave?.rows ?? scored;
const waveCheck = (r: SkuRow | WaveRow) => ("check" in r ? [r.check, money(r.recomputed_discount || undefined)] : []);

const pct = (x: number | undefined) => (x === undefined ? "" : (x * 100).toFixed(1));
function money(x: number | undefined) {
  return x === undefined ? "" : x.toFixed(2);
}
const members = stores.filter((s) => s.member && s.store_type === STORE_TYPE);
const counts = {
  members: members.length,
  all_members: stores.filter((s) => s.member).length,
  nonmembers: stores.filter((s) => !s.member && s.store_type === STORE_TYPE && s.orders_90d > 0).length,
};
const sum = summarize(rows, counts);

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, `${variant.file}.csv`),
  toCsv([
    ["department", "category", "catalog_item", "priority", "mercaso_sku", "product", "case_pack", "member_pen_pct", "member_buyers", "nonmember_pen_pct", "nonmember_buyers", "all_member_pen_pct", "sku_member_pen_pct", "no_member_buyers", "band_discount", "on_promo", "price_no_crv", "regular_price", "cost_no_crv", "existing_member_discount", "margin_before_pct", "max_discount_at_floor", "discount", "stepped_down", "member_price", "margin_after_pct", "excluded", "member_cases_90d", "all_member_cases_90d", "est_cost_90d_all_members", "also_in", "node_id", ...(wave ? ["wave_check", "discount_today"] : [])],
    ...rows.map((r) => [
      r.department, r.category, r.item, r.priority, r.sku, r.title, r.case_pack,
      pct(r.member_pen), String(r.member_buyers), pct(r.nonmember_pen), String(r.nonmember_buyers), pct(r.all_member_pen), pct(r.sku_member_pen),
      r.no_member_buyers ? "yes" : "", money(r.band || undefined), r.promo === undefined ? "" : r.promo ? "yes" : "no",
      money(r.price), money(r.regular_price), money(r.cost), money(r.existing_member_discount || undefined),
      pct(r.margin_before), money(r.max_discount), money(r.discount || undefined), r.stepped_down ? "yes" : "",
      r.discount && r.price !== undefined ? money(r.price - r.existing_member_discount - r.discount) : "", pct(r.margin_after),
      r.excluded ?? "", String(r.member_cases), String(r.all_member_cases), r.discount ? money(r.discount * r.all_member_cases) : "",
      r.also_in.join(" | "), r.node_id, ...waveCheck(r),
    ]),
  ]),
);

// Membership timeline: ACTIVE rows worth a second look (kept in the member set).
const flagged = {
  newer_inactive: storeRows.filter((r) => r.member === "yes" && r.newer_inactive_row === "yes").length,
  expired: storeRows.filter((r) => r.member === "yes" && r.expires_at !== "" && r.expires_at! < asOf).length,
  leaving: storeRows.filter((r) => r.member === "yes" && r.cancel_at_period_end === "yes").length,
};
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const discounted = rows.filter((r) => r.discount > 0);
const n = (d: string) => sum.by_discount[d] ?? 0;
const p = (d: string) => sum.by_discount_promo[d] ?? 0;
const ex = (k: string) => sum.excluded[k] ?? 0;
const waveRows = wave?.rows ?? [];
const checks = (c: string) => waveRows.filter((r) => r.check === c);
const listed = (rs: WaveRow[]) => rs.map((r) => `- ${r.sku} ${r.title}: wave $${r.discount.toFixed(2)}, ${r.check === "floor_breaks" ? `floor allows $${money(r.max_discount) || "?"}` : `today's scoring gives ${r.recomputed_discount ? `$${r.recomputed_discount.toFixed(2)}` : `none (${r.excluded})`}`}`).join("\n");
const notDiscounted = wave
  ? `## Wave check against today's prices and scoring

The wave's discounts are the decision; this re-checks them. ${checks("ok").length} SKUs as approved, ${checks("band_changed").length} where today's scoring would give another amount (the wave's still fits the floor), **${checks("floor_breaks").length} where the wave's discount now breaks the ${MARGIN_FLOOR * 100}% floor**${wave.missing.length ? `, ${wave.missing.length} no longer approved in the match file (${wave.missing.join(", ")})` : ""}.
${checks("floor_breaks").length ? `\nBreaks the floor (fix before running):\n\n${listed(checks("floor_breaks"))}\n` : ""}${checks("band_changed").length ? `\nBand changed:\n\n${listed(checks("band_changed"))}\n` : ""}`
  : `## Not discounted (${sum.skus} SKUs on ${sum.items} items scored)

| Reason | SKUs |
|---|---|
| 15% or more of members buy the item | ${ex("penetration_15pct_plus")} |
| Failed the 5% floor even at $0.50 | ${ex("margin_floor")} |
| Supply hold (Arizona) | ${ex("supply_hold")} |
| No sales to any store in ${WINDOW_DAYS} days | ${ex("no_sales")} |
| No price (not active) | ${ex("no_price")} |
| No Finale cost | ${ex("no_cost")} |

${sum.no_member_buyers} SKUs belong to items no liquor member bought in the window though other stores did (flagged \`no_member_buyers\`; they get the $2 band if the floor allows).`;
const scope = wave
  ? `The SKUs and discounts approved for this wave (\`${variant.wave}\`), scored the same way as v1: penetration is the share`
  : `Penetration: share`;
const summary = `# Member discounts — liquor catalog, ${variantName} (${asOf})

${scope} of the ${sum.members} active liquor-store members that bought the catalog item (any approved SKU) from Mercaso in the last ${WINDOW_DAYS} days. ${wave ? "" : `${priorityText[0]!.toUpperCase()}${priorityText.slice(1)} items. `}Discount per case on every approved SKU of the item, stepped down ($2 → $1 → $0.50) to keep a ${MARGIN_FLOOR * 100}% margin after any promo and existing member discount.

Context: ${sum.all_members} active members of every store type; ${sum.nonmembers} non-member liquor stores that ordered in the window.

## SKUs per discount

| Discount | SKUs | of which on promo |
|---|---|---|
| $2.00 | ${n("2")} | ${p("2")} |
| $1.00 | ${n("1")} | ${p("1")} |
| $0.50 | ${n("0.5")} | ${p("0.5")} |
| **Total** | **${discounted.length}** (${new Set(discounted.map((r) => r.node_id)).size} items) | ${p("2") + p("1") + p("0.5")} |

${sum.stepped_down} SKUs were stepped down to a smaller band to fit the floor.

${notDiscounted}

## Cost at current member volumes (no lift assumed)

| Members | ${WINDOW_DAYS} days | A year (× 365/${WINDOW_DAYS}) |
|---|---|---|
| Liquor-store members | ${usd(sum.cost_window_members)} | ${usd((sum.cost_window_members * 365) / WINDOW_DAYS)} |
| All members | ${usd(sum.cost_window_all_members)} | ${usd((sum.cost_window_all_members * 365) / WINDOW_DAYS)} |

## Membership timeline

All ${sum.all_members} stores with an ACTIVE row in the latest snapshot are counted. To double-check: ${flagged.newer_inactive} with a cancelled or suspended membership updated after the active one, ${flagged.expired} whose period ended before ${asOf} without a renewal yet, ${flagged.leaving} set to cancel at period end.
`;
writeFileSync(join(OUT, `${variant.file}-summary.md`), summary);
console.log(summary);
console.log(`wrote dist/member-discount/${variant.file}.csv (${rows.length} rows) and ${variant.file}-summary.md`);
