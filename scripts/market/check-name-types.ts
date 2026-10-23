// How well a store's name predicts its type: the name rule (prospectType) against customers whose
// type is known. Prints the share of names that say a type and how often that type is right.
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { prospectType } from "../growth/lib.ts";
import { UNTYPED } from "./lib.ts";

const rows = (parse(readFileSync("data/raw/market_stores.csv", "utf8"), { columns: true }) as Record<string, string>[]).filter(
  (r) => !UNTYPED.has((r.store_type ?? "").trim()),
);
const byType = new Map<string, { n: number; said: number; right: number }>();
for (const r of rows) {
  const t = r.store_type!.trim();
  const g = prospectType(r.store_name ?? "");
  const e = byType.get(t) ?? { n: 0, said: 0, right: 0 };
  e.n++;
  if (g) e.said++;
  if (g === t) e.right++;
  byType.set(t, e);
}
const said = [...byType.values()].reduce((a, e) => a + e.said, 0);
const right = [...byType.values()].reduce((a, e) => a + e.right, 0);
console.log(`Known-type customers: ${rows.length}; the name says a type for ${said} (${((said / rows.length) * 100).toFixed(0)}%), right ${right} times (${((right / said) * 100).toFixed(0)}%).`);
for (const [t, e] of [...byType].sort((a, b) => b[1].n - a[1].n))
  console.log(`${t.padEnd(20)} ${String(e.n).padStart(5)}  name says a type ${((e.said / e.n) * 100).toFixed(0).padStart(3)}%  right ${e.said ? ((e.right / e.said) * 100).toFixed(0).padStart(3) : "  –"}%`);
