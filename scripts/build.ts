/**
 * Builds dist/<store-type>.json for each store type: the carried tree with priorities resolved,
 * effective restriction flags, and match coverage per leaf. Refuses to build if validation fails.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatIssue, loadCatalog } from "./lib/load.ts";
import { summarizeMatches } from "./lib/matches.ts";
import { buildCatalogJson } from "./lib/output.ts";

const root = process.argv[2] ?? process.cwd();
const { storeTypes, issues } = loadCatalog(root);

const errors = issues.filter((i) => i.level === "error");
if (errors.length > 0) {
  for (const issue of errors) console.log(formatIssue(issue));
  console.log(`\nBuild stopped: ${errors.length} validation error(s). Run pnpm validate for details.`);
  process.exit(1);
}

const outDir = join(root, "dist");
mkdirSync(outDir, { recursive: true });
for (const { resolved, matches } of storeTypes) {
  const json = buildCatalogJson(resolved, summarizeMatches(matches, resolved));
  const path = join(outDir, `${resolved.def.store_type}.json`);
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
  const s = json.summary;
  console.log(
    `dist/${resolved.def.store_type}.json: ${s.leaves} leaves ` +
      `(must ${s.by_priority.must}, should ${s.by_priority.should}, nice ${s.by_priority.nice}); ` +
      `matched ${s.match.matched}, covered ${s.match.covered}, partial ${s.match.partial}, gap ${s.match.gap}`,
  );
}
