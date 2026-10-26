/**
 * The market report's base file (docs/exploration/market.md). Reads data/raw/market_stores.csv and
 * data/raw/market_zips.csv (`pnpm athena:export market-stores market-zips`), data/raw/prospects.csv
 * (the sales prospect list), data/market/zones.yaml, optionally dist/places/unified.csv (`pnpm places`:
 * places from a Google Places scrape that are new to us), and, for gross margin per store type,
 * pricing.csv and lift_store_skus.csv. Writes dist/market/market.json (gitignored): one cell per
 * zone × sub-area × store type × rep with its active, churned and prospect stores and their
 * yearly sales, which the site's Market tab turns into targets and dollars.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { parse as parseYaml } from "yaml";
import { churnedYear, marginRate, prospectType, statusOf, typeProfiles, type GrowthStore } from "../growth/lib.ts";
import { areaOfZip, indexer, repsByZip, typeWeights, UNTYPED, type MarketCell } from "./lib.ts";

const ROOT = process.cwd();
const UNASSIGNED = "Unassigned";
const read = (file: string, hint: string): Record<string, string>[] => {
  const path = join(ROOT, file);
  if (!existsSync(path)) {
    console.error(`${file} is missing. ${hint}`);
    process.exit(1);
  }
  return parse(readFileSync(path, "utf8"), { columns: true, bom: true });
};

const storeRows = read("data/raw/market_stores.csv", "Run pnpm athena:export market-stores market-zips.");
const asOf = storeRows[0]?.as_of ?? new Date().toISOString().slice(0, 10);
// A store with no type (blank or Unknown) takes the type its name says, else is spread over the
// typed stores' types in their proportions: the same fallback as for prospects, so no store is untyped.
const customerMix = new Map<string, number>();
for (const r of storeRows) {
  const t = (r.store_type ?? "").trim();
  if (!UNTYPED.has(t)) customerMix.set(t, (customerMix.get(t) ?? 0) + 1);
}
const stores = storeRows.map((r) => ({
  zip: r.postal_code ?? "",
  weights: typeWeights(r.store_type ?? "", r.store_name ?? "", prospectType, customerMix),
  s: {
    id: r.store_id!,
    type: r.store_type ?? "",
    first_order_date: r.first_order_date ?? "",
    last_order_date: r.last_order_date ?? "",
    spend_12m: Number(r.spend_12m) || 0,
    orders_12m: Number(r.orders_12m) || 0,
    spend_before: Number(r.spend_before) || 0,
    orders_before: Number(r.orders_before) || 0,
  } satisfies GrowthStore,
}));
const regions = new Map(read("data/raw/market_zips.csv", "Run pnpm athena:export market-zips.").map((r) => [r.zip!, r.region!]));
const prospects = read("data/raw/prospects.csv", "Save the sales prospect list as data/raw/prospects.csv.");
const zonesFile = parseYaml(readFileSync(join(ROOT, "data/market/zones.yaml"), "utf8")) as {
  zones: { name: string; regions: string[] }[];
  zip3_regions: Record<string, string>;
};

// Dimensions, in display order: zones as listed, then Unassigned; sub-areas zone by zone.
const zones = [...zonesFile.zones.map((z) => z.name), UNASSIGNED];
const zoneOfRegion = new Map(zonesFile.zones.flatMap((z, i) => z.regions.map((r) => [r, i] as const)));
const areas: string[] = [];
const areaZone: number[] = [];
for (const [i, z] of zonesFile.zones.entries())
  for (const r of z.regions) {
    areas.push(r);
    areaZone.push(i);
  }
const areaAt = indexer(areas);
const placeArea = (zip: string) => {
  const region = areaOfZip(zip, regions, zonesFile.zip3_regions) || UNASSIGNED;
  const a = areaAt(region);
  if (areaZone[a] === undefined) areaZone[a] = zoneOfRegion.get(region) ?? zones.length - 1;
  return a;
};
const types: string[] = [];
const typeAt = indexer(types);
const reps: string[] = [];
const repAt = indexer(reps);
const repOfZip = repsByZip(prospects.filter((p) => p.zone !== UNASSIGNED).map((p) => ({ zip: p.zip_code ?? "", rep: p.salesperson ?? "" })));

// Margin per store type, from what today's active stores buy in the catalogs (as in pnpm growth).
// Stores with one type (their own or their name's) set the margins and the new-store profiles.
const single = stores.filter(({ weights }) => weights.length === 1).map(({ s, weights }) => ({ ...s, type: weights[0]![0] }));
const active = single.filter((s) => statusOf(s, asOf) === "active");
const activeType = new Map(active.map((s) => [s.id, s.type]));
const price = existsSync(join(ROOT, "data/raw/pricing.csv"))
  ? new Map(read("data/raw/pricing.csv", "").map((r) => [r.sku_number!, { price: Number(r.price) || 0, ...(r.average_cost === "" ? {} : { cost: Number(r.average_cost) }) }]))
  : new Map<string, { price: number; cost?: number }>();
const marginRows = new Map<string, { cases: number; price?: number; cost?: number }[]>();
const allRows: { cases: number; price?: number; cost?: number }[] = [];
if (existsSync(join(ROOT, "data/raw/lift_store_skus.csv"))) {
  for (const r of read("data/raw/lift_store_skus.csv", "")) {
    const t = activeType.get(r.store_id!);
    if (t === undefined) continue;
    const p = price.get(r.sku!);
    const row = { cases: Number(r.cases) || 0, ...(p ? { price: p.price, ...(p.cost !== undefined ? { cost: p.cost } : {}) } : {}) };
    const list = marginRows.get(t) ?? [];
    list.push(row);
    marginRows.set(t, list);
    allRows.push(row);
  }
}
const marginOverall = marginRate(allRows) ?? 0.13;
const marginOf = (t: string) => marginRate(marginRows.get(t) ?? []) ?? marginOverall;

// A new store spends like today's active stores of its type, in today's mix of ordering bands.
const profiles = typeProfiles(single, asOf);
const fallback = [...profiles.values()].reduce((a, p) => (p.stores > a.stores ? p : a));
const profileOf = (t: string) => profiles.get(t) ?? fallback;
// Churned stores come back with the business they had; giants are capped at the 95th percentile.
const churned = stores.filter(({ s }) => statusOf(s, asOf) === "churned");
const churnSpend = churned.map(({ s }) => churnedYear(s)).sort((a, b) => a - b);
const churnCap = churnSpend[Math.floor(churnSpend.length * 0.95)] ?? 0;

const cells = new Map<string, MarketCell>();
const cellOf = (zip: string, type: string, rep: string) => {
  const area = placeArea(zip);
  const zone = areaZone[area]!;
  const t = typeAt(type);
  const r = repAt(rep);
  const key = `${area}|${t}|${r}`;
  let c = cells.get(key);
  if (!c) {
    c = { zone, area, type: t, rep: r, active: 0, activeRevenue: 0, activeProfit: 0, newPace: 0, churned: 0, churnedRevenue: 0, churnedProfit: 0, prospects: 0, placesProspects: 0 };
    cells.set(key, c);
  }
  return c;
};
const repFor = (zip: string) => repOfZip.get(zip.trim().slice(0, 5)) ?? UNASSIGNED;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

for (const { zip, s, weights } of stores) {
  const status = statusOf(s, asOf);
  if (status === "lapsed") continue; // last ordered over a year ago: outside the market, as in pnpm growth
  for (const [type, w] of weights) {
    const c = cellOf(zip, type, repFor(zip));
    const m = marginOf(type);
    if (status === "active") {
      c.active += w;
      c.activeRevenue += s.spend_12m * w;
      c.activeProfit += s.spend_12m * w * m;
      if (days(s.first_order_date, asOf) <= 365) c.newPace += w;
    } else {
      const v = Math.min(churnedYear(s), churnCap) * w;
      c.churned += w;
      c.churnedRevenue += v;
      c.churnedProfit += v * m;
    }
  }
}

// Prospects: placed by their own ZIP and rep. A name that doesn't say the store type is spread over
// the types the other prospects have, in their proportions (fractional counts).
const typed = prospects.map((p) => ({ p, t: prospectType(p.name ?? "") }));
const mix = new Map<string, number>();
for (const { t } of typed) if (t) mix.set(t, (mix.get(t) ?? 0) + 1);
const mixTotal = [...mix.values()].reduce((a, b) => a + b, 0);
for (const { p, t } of typed) {
  const rep = p.zone === UNASSIGNED || !p.salesperson ? UNASSIGNED : p.salesperson;
  if (t) cellOf(p.zip_code ?? "", t, rep).prospects++;
  else for (const [mt, n] of mix) cellOf(p.zip_code ?? "", mt, rep).prospects += n / mixTotal;
}

// Places from the scrape that are new to us (not a customer in 24 months, not on the list): a second
// source of prospects the Market tab can add, placed by ZIP and typed by their Google category.
const CATEGORY_TYPE: Record<string, string> = {
  grocery: "Market / grocery",
  market: "Market / grocery",
  gas: "Gas station",
  truck_stop: "Gas station",
  c_store: "Convenience store",
  liquor: "Liquor store",
  laundromat: "Laundromat",
  discount: "Discount dollar",
  restaurant: "Restaurant",
};
let placesAdded = 0;
if (existsSync(join(ROOT, "dist/places/unified.csv"))) {
  for (const r of parse(readFileSync(join(ROOT, "dist/places/unified.csv"), "utf8"), { columns: true }) as Record<string, string>[]) {
    if (r.source !== "places" || r.mercaso_store_id || r.on_prospect_list === "yes") continue;
    cellOf(r.zip ?? "", CATEGORY_TYPE[r.places_category ?? ""] ?? "Miscellaneous", repFor(r.zip ?? "")).placesProspects++;
    placesAdded++;
  }
}

// Unassigned last in each list.
const rep0 = reps.filter((r) => r !== UNASSIGNED).sort();
const repOrder = [...rep0, ...(reps.includes(UNASSIGNED) ? [UNASSIGNED] : [])];
const typeTotals = new Map<number, number>();
for (const c of cells.values()) typeTotals.set(c.type, (typeTotals.get(c.type) ?? 0) + c.active + c.churned + c.prospects);
const typeOrder = types.map((_, i) => i).sort((a, b) => (typeTotals.get(b) ?? 0) - (typeTotals.get(a) ?? 0));
const typeRemap = new Map(typeOrder.map((old, i) => [old, i]));
const repRemap = new Map(reps.map((r, old) => [old, repOrder.indexOf(r)]));
const r2 = (x: number) => Math.round(x * 100) / 100;

const base = {
  schema_version: 1,
  as_of: asOf,
  zones,
  areas,
  areaZone,
  types: typeOrder.map((i) => {
    const t = types[i]!;
    const p = profileOf(t);
    return { name: t || "No type set", newStore: Math.round(p.newStore.expected), newStoreLow: Math.round(p.newStore.low), margin: r2(marginOf(t) * 100) / 100 };
  }),
  reps: repOrder,
  /** Places new to us from the Google Places scrape, in all (0 when the scrape wasn't matched). */
  places_prospects: placesAdded,
  // [zone, area, type, rep, active, activeRevenue, activeProfit, newPace, churned, churnedRevenue, churnedProfit, prospects, placesProspects]
  cells: [...cells.values()].map((c) => [
    c.zone,
    c.area,
    typeRemap.get(c.type)!,
    repRemap.get(c.rep)!,
    r2(c.active),
    Math.round(c.activeRevenue),
    Math.round(c.activeProfit),
    r2(c.newPace),
    r2(c.churned),
    Math.round(c.churnedRevenue),
    Math.round(c.churnedProfit),
    r2(c.prospects),
    c.placesProspects,
  ]),
};

mkdirSync(join(ROOT, "dist/market"), { recursive: true });
writeFileSync(join(ROOT, "dist/market/market.json"), JSON.stringify(base));

// Printout: the market by zone.
const sum = (f: (c: MarketCell) => number, keep: (c: MarketCell) => boolean = () => true) => [...cells.values()].filter(keep).reduce((a, c) => a + f(c), 0);
const n0 = (x: number) => Math.round(x).toLocaleString("en-US");
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const market = (keep: (c: MarketCell) => boolean) => sum((c) => c.active + c.churned + c.prospects, keep);
console.log(`Market base: ${n0(sum((c) => c.active))} active, ${n0(sum((c) => c.churned))} churned, ${n0(sum((c) => c.prospects))} prospects, ${n0(placesAdded)} more from the Places scrape; ${cells.size} cells; as of ${asOf}.`);
for (const [i, z] of zones.entries()) {
  const keep = (c: MarketCell) => c.zone === i;
  const m = market(keep);
  console.log(`${z.padEnd(24)} market ${n0(m).padStart(6)}  active ${n0(sum((c) => c.active, keep)).padStart(5)}  penetration ${pct(m ? sum((c) => c.active, keep) / m : 0)}  new last 12 mo ${n0(sum((c) => c.newPace, keep))}`);
}
const untyped = storeRows.filter((r) => UNTYPED.has((r.store_type ?? "").trim()));
const byName = untyped.filter((r) => prospectType(r.store_name ?? "")).length;
console.log(`Untyped customers: ${n0(untyped.length)}; ${n0(byName)} typed by their name, ${n0(untyped.length - byName)} spread over the typed stores' mix.`);
console.log(`Areas: ${areas.length}; reps: ${repOrder.join(", ")}; types: ${base.types.map((t) => t.name).join(", ")}`);
