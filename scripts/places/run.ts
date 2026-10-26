/**
 * One unified list of stores from a Google Places scrape, Mercaso's customers of the last 24 months
 * and the sales prospect list (docs/exploration/places.md). Reads data/raw/places_clean.csv (the
 * scrape), data/raw/store_places.csv (`pnpm athena:export store-places`), data/raw/prospects.csv,
 * data/raw/market_zips.csv and data/market/zones.yaml. Writes, under the gitignored dist/places/:
 *   unified.csv   one row per store: its place, its Mercaso store and status, whether it is on the
 *                 prospect list, how it was matched, rep and zone
 *   summary.md    how the scrape compares with the customers and the prospect list
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { parse as parseYaml } from "yaml";
import { toCsv } from "../athena/lib.ts";
import { prospectType } from "../growth/lib.ts";
import { areaOfZip, repsByZip } from "../market/lib.ts";
import { matchByName, matchStores, nameSimilarity, type Place, type Store } from "./lib.ts";

const ROOT = process.cwd();
const OUT = join(ROOT, "dist/places");
const read = (file: string, hint: string): Record<string, string>[] => {
  const path = join(ROOT, file);
  if (!existsSync(path)) {
    console.error(`${file} is missing. ${hint}`);
    process.exit(1);
  }
  return parse(readFileSync(path, "utf8"), { columns: true, bom: true });
};

const placeRows = read("data/raw/places_clean.csv", "Save the Places scrape as data/raw/places_clean.csv.");
const storeRows = read("data/raw/store_places.csv", "Run pnpm athena:export store-places.");
const prospects = read("data/raw/prospects.csv", "Save the sales prospect list as data/raw/prospects.csv.");
const regions = new Map(read("data/raw/market_zips.csv", "Run pnpm athena:export market-zips.").map((r) => [r.zip!, r.region!]));
const zonesFile = parseYaml(readFileSync(join(ROOT, "data/market/zones.yaml"), "utf8")) as { zones: { name: string; regions: string[] }[]; zip3_regions: Record<string, string> };
const zoneOfRegion = new Map(zonesFile.zones.flatMap((z) => z.regions.map((r) => [r, z.name] as const)));
const zoneOf = (zip: string) => zoneOfRegion.get(areaOfZip(zip, regions, zonesFile.zip3_regions)) ?? "Unassigned";
const repOfZip = repsByZip(prospects.filter((p) => p.zone !== "Unassigned").map((p) => ({ zip: p.zip_code ?? "", rep: p.salesperson ?? "" })));
const asOf = new Date().toISOString().slice(0, 10);
const daysSince = (d: string) => Math.round((Date.parse(asOf) - Date.parse(d)) / 86_400_000);
const statusOf = (last: string) => (daysSince(last) <= 45 ? "active" : daysSince(last) <= 365 ? "stopped (12 mo)" : "lapsed (12-24 mo)");

// The scrape's categories in Mercaso's store types.
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

const places: (Place & { category: string })[] = placeRows.map((r) => ({
  id: r.place_id!,
  name: r.name ?? "",
  address: r.city ?? r.address ?? "", // "city" holds the street address and city in this file
  zip: (r.zip ?? "").slice(0, 5),
  lat: Number(r.lat) || 0,
  lng: Number(r.lng) || 0,
  category: r.category ?? "",
}));
const placeById = new Map(places.map((p) => [p.id, p]));
const stores: (Store & { type: string; first: string; last: string })[] = storeRows.map((r) => ({
  id: r.store_id!,
  name: r.store_name ?? "",
  address: r.line_1 ?? "",
  zip: (r.zip ?? "").slice(0, 5),
  lat: Number(r.lat) || 0,
  lng: Number(r.lng) || 0,
  placeId: r.place_id ?? "",
  type: r.store_type ?? "",
  first: r.first_order_date ?? "",
  last: r.last_order_date ?? "",
}));

// 1. Customers to places.
const storeMatch = matchStores(stores, places);
const placeToStore = new Map([...storeMatch].map(([s, m]) => [m.place, s]));

// 2. Prospects (name and ZIP only) to places, then to customers not matched to a place.
const placesByZip = new Map<string, Place[]>();
for (const p of places) placesByZip.set(p.zip, [...(placesByZip.get(p.zip) ?? []), p]);
const storesByZip = new Map<string, typeof stores>();
for (const s of stores) storesByZip.set(s.zip, [...(storesByZip.get(s.zip) ?? []), s]);
const prospectPlace = new Map<number, string>();
const prospectStore = new Map<number, string>();
const placeProspect = new Map<string, number>();
prospects.forEach((p, i) => {
  const zip = (p.zip_code ?? "").slice(0, 5);
  if (!zip) return;
  const hit = matchByName(p.name ?? "", zip, (placesByZip.get(zip) ?? []).filter((x) => !placeProspect.has(x.id)));
  if (hit) {
    prospectPlace.set(i, hit.id);
    placeProspect.set(hit.id, i);
    return;
  }
  const s = (storesByZip.get(zip) ?? []).filter((x) => !storeMatch.has(x.id)).find((x) => nameSimilarity(x.name, p.name ?? "") >= 0.75);
  if (s) prospectStore.set(i, s.id);
});
const storeProspect = new Set<string>([...prospectStore.values(), ...[...prospectPlace.values()].map((pl) => placeToStore.get(pl)).filter((x): x is string => !!x)]);

// 3. The unified list: every place, every customer without a place, every listed prospect without either.
type Row = Record<string, string>;
const rows: Row[] = [];
const storeById = new Map(stores.map((s) => [s.id, s]));
for (const p of places) {
  const sid = placeToStore.get(p.id);
  const s = sid ? storeById.get(sid) : undefined;
  rows.push({
    place_id: p.id,
    name: p.name,
    address: p.address,
    zip: p.zip,
    places_category: p.category,
    mercaso_store_id: s?.id ?? "",
    mercaso_name: s?.name ?? "",
    mercaso_type: s?.type ?? "",
    mercaso_status: s ? statusOf(s.last) : "never ordered",
    first_order: s?.first ?? "",
    last_order: s?.last ?? "",
    match: s ? storeMatch.get(s.id)!.method : "",
    match_confidence: s ? (storeMatch.get(s.id)!.sim >= 0.5 ? "high" : "check") : "",
    on_prospect_list: placeProspect.has(p.id) ? "yes" : "",
    source: "places",
    rep: repOfZip.get(p.zip) ?? "Unassigned",
    zone: zoneOf(p.zip),
  });
}
for (const s of stores) {
  if (storeMatch.has(s.id)) continue;
  rows.push({
    place_id: s.placeId,
    name: s.name,
    address: s.address,
    zip: s.zip,
    places_category: "",
    mercaso_store_id: s.id,
    mercaso_name: s.name,
    mercaso_type: s.type,
    mercaso_status: statusOf(s.last),
    first_order: s.first,
    last_order: s.last,
    match: "not in the scrape",
    match_confidence: "",
    on_prospect_list: storeProspect.has(s.id) ? "yes" : "",
    source: "mercaso",
    rep: repOfZip.get(s.zip) ?? "Unassigned",
    zone: zoneOf(s.zip),
  });
}
prospects.forEach((p, i) => {
  if (prospectPlace.has(i) || prospectStore.has(i)) return;
  const zip = (p.zip_code ?? "").slice(0, 5);
  rows.push({
    place_id: "",
    name: p.name ?? "",
    address: p.city ?? "",
    zip,
    places_category: "",
    mercaso_store_id: "",
    mercaso_name: "",
    mercaso_type: prospectType(p.name ?? ""),
    mercaso_status: "never ordered",
    first_order: "",
    last_order: "",
    match: zip ? "list only (not found in the scrape)" : "list only (no ZIP)",
    match_confidence: "",
    on_prospect_list: "yes",
    source: "prospect list",
    rep: p.zone === "Unassigned" || !p.salesperson ? "Unassigned" : p.salesperson,
    zone: zip ? zoneOf(zip) : "Unassigned",
  });
});
mkdirSync(OUT, { recursive: true });
const cols = Object.keys(rows[0]!);
writeFileSync(join(OUT, "unified.csv"), toCsv([cols, ...rows.map((r) => cols.map((c) => r[c] ?? ""))]));

// 4. Summary.
const n0 = (x: number) => x.toLocaleString("en-US");
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
const count = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
};
const recent = stores.filter((s) => daysSince(s.last) <= 365);
const active = stores.filter((s) => daysSince(s.last) <= 45);
const matched = (list: typeof stores) => list.filter((s) => storeMatch.has(s.id)).length;
const methods = count([...storeMatch.values()], (m) => m.method);
// Type agreement for matched customers whose Mercaso type is one the scrape covers.
const agree = [...storeMatch].map(([sid, m]) => ({ t: storeById.get(sid)!.type, c: CATEGORY_TYPE[placeById.get(m.place)!.category] ?? "" })).filter((x) => x.t && x.c);
const typeRows = count(stores, (s) => s.type || "No type set").map(([t, n]) => {
  const mine = stores.filter((s) => (s.type || "No type set") === t);
  const act = mine.filter((s) => daysSince(s.last) <= 45);
  return `| ${t} | ${n0(n)} | ${pct(matched(mine), n)} | ${pct(matched(act), act.length)} |`;
});
const withZip = prospects.filter((p) => (p.zip_code ?? "").trim());
const placesOnly = rows.filter((r) => r.source === "places" && !r.mercaso_store_id && !r.on_prospect_list);
const zones = [...zonesFile.zones.map((z) => z.name), "Unassigned"];
const zoneRows = zones.map((z) => {
  const pl = places.filter((p) => zoneOf(p.zip) === z).length;
  const cust = recent.filter((s) => zoneOf(s.zip) === z);
  return `| ${z} | ${n0(pl)} | ${n0(cust.length)} | ${pct(matched(cust), cust.length)} | ${n0(placesOnly.filter((r) => r.zone === z).length)} |`;
});
const statusRows = count(rows, (r) => `${r.mercaso_status}${r.mercaso_store_id ? "" : r.on_prospect_list ? " · on the list" : " · new from the scrape"}`);

const summary = `# Places scrape against Mercaso's customers and the prospect list (${asOf})

## The scrape

${n0(places.length)} places, one per Google place id: ${count(places, (p) => p.category).map(([c, n]) => `${c} ${n0(n)}`).join(", ")}.

## How many of our customers it finds

Our customers of the last 24 months: ${n0(stores.length)} (${n0(recent.length)} ordered in the last 12 months, ${n0(active.length)} active). The scrape finds **${pct(matched(stores), stores.length)}** of them, **${pct(matched(recent), recent.length)}** of the last 12 months and **${pct(matched(active), active.length)}** of the active ones (${methods.map(([m, n]) => `${m} ${n0(n)}`).join(", ")}; ${n0([...storeMatch.values()].filter((m) => m.sim < 0.5).length)} with a name under 0.5 similar are flagged "check"). Mercaso's stored Google place ids point to the building address, not the business listing, so none equal the scrape's ids; matching is by location and name.

| Mercaso store type | Customers (24 mo) | Found in the scrape | Active found |
|---|---|---|---|
${typeRows.join("\n")}

Where the type is one the scrape covers, its category agrees with Mercaso's type for ${pct(agree.filter((x) => x.t === x.c).length, agree.length)} of matched stores.

## By zone

| Zone | Places | Customers (12 mo) | Found in the scrape | Places new to us (not a customer, not on the list) |
|---|---|---|---|---|
${zoneRows.join("\n")}

## Against today's prospect list

- The list has ${n0(prospects.length)} prospects; ${n0(withZip.length)} have a ZIP. Of those, **${n0(prospectPlace.size)} (${pct(prospectPlace.size, withZip.length)}) are in the scrape** (same ZIP, similar name) and ${n0(prospectStore.size)} more are already customers the scrape missed.
- ${n0(prospects.length - withZip.length)} prospects have no ZIP and can't be matched by place.
- **${n0(placesOnly.length)} places are new**: not a customer in 24 months and not on the list.

## The unified list (dist/places/unified.csv)

| Status | Stores |
|---|---|
${statusRows.map(([k, n]) => `| ${k} | ${n0(n)} |`).join("\n")}
| **Total** | **${n0(rows.length)}** |
`;
writeFileSync(join(OUT, "summary.md"), summary);
console.log(summary);
