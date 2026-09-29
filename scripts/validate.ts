/**
 * Checks every data file: schema shape, tree structure, id uniqueness, size and cross references,
 * store-type includes and priority coverage, and match rows. Exits 1 on any error.
 */
import { formatIssue, loadCatalog } from "./lib/load.ts";

const root = process.argv[2] ?? process.cwd();
const { taxonomy, storeTypes, issues } = loadCatalog(root);

for (const issue of issues) console.log(formatIssue(issue));

const errors = issues.filter((i) => i.level === "error").length;
const warnings = issues.length - errors;
const leaves = [...taxonomy.byId.values()].filter((n) => n.kind === "size" || n.kind === "assortment_slot").length;
console.log(
  `\n${taxonomy.roots.length} department(s), ${taxonomy.byId.size} nodes, ${leaves} leaves; ` +
    `${storeTypes.length} store type(s). ${errors} error(s), ${warnings} warning(s).`,
);
process.exit(errors > 0 ? 1 : 0);
