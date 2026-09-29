import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { Ajv, type ErrorObject } from "ajv";
import { parseDocument } from "yaml";
import { checkMatchesAgainstStoreType, parseMatches } from "./matches.ts";
import { resolveStoreType, type ResolvedStoreType } from "./store-type.ts";
import { buildTaxonomy, type DepartmentSource } from "./taxonomy.ts";
import type { AuthoredNode, Issue, MatchRow, StoreTypeFile, Taxonomy, TaxonomyIndex } from "./types.ts";

export interface LoadedStoreType {
  resolved: ResolvedStoreType;
  matchFile: string;
  matches: MatchRow[];
}

export interface Catalog {
  taxonomy: Taxonomy;
  storeTypes: LoadedStoreType[];
  issues: Issue[];
}

type SchemaName = "taxonomy_index" | "department_file" | "store_type_file";

function makeValidators(root: string) {
  const schema = JSON.parse(readFileSync(join(root, "schema/catalog.schema.json"), "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: true });
  ajv.addSchema(schema);
  return (name: SchemaName) => {
    const fn = ajv.getSchema(`catalog.schema.json#/$defs/${name}`);
    if (!fn) throw new Error(`schema $defs/${name} not found`);
    return fn;
  };
}

/** Name the node a JSON pointer lands in, e.g. "/children/0/children/2/kind" -> "cola > coca-cola". */
function describePath(data: unknown, pointer: string): string {
  if (!pointer) return "(root)";
  const keys: string[] = [];
  let cur: unknown = data;
  for (const part of pointer.split("/").slice(1)) {
    if (cur === null || typeof cur !== "object") break;
    cur = (cur as Record<string, unknown>)[part];
    const key = cur && typeof cur === "object" && !Array.isArray(cur) ? (cur as { key?: unknown }).key : undefined;
    if (typeof key === "string") keys.push(key);
  }
  return keys.length > 0 ? `${pointer} (${keys.join(" > ")})` : pointer;
}

function formatAjvError(e: ErrorObject, data: unknown): string {
  const at = describePath(data, e.instancePath);
  if (e.keyword === "additionalProperties") {
    return `${at}: unknown field "${(e.params as { additionalProperty: string }).additionalProperty}"`;
  }
  if (e.keyword === "enum") {
    return `${at}: must be one of ${(e.params as { allowedValues: unknown[] }).allowedValues.join(", ")}`;
  }
  return `${at}: ${e.message}`;
}

/** Read a YAML file and check it against one of the schema's $defs. Returns undefined on any error. */
function readYaml<T>(
  root: string,
  path: string,
  schemaName: SchemaName,
  validator: ReturnType<typeof makeValidators>,
  issues: Issue[],
): T | undefined {
  const file = relative(root, path);
  const doc = parseDocument(readFileSync(path, "utf8"), { uniqueKeys: true });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) issues.push({ level: "error", file, message: `YAML: ${e.message}` });
    return undefined;
  }
  const data = doc.toJS();
  const validate = validator(schemaName);
  if (!validate(data)) {
    // With oneOf/allOf ajv can repeat an error; keep each message once.
    const messages = new Set((validate.errors ?? []).map((e) => formatAjvError(e, data)));
    for (const message of messages) issues.push({ level: "error", file, message });
    return undefined;
  }
  return data as T;
}

const yamlFiles = (dir: string) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort().map((f) => join(dir, f)) : [];

export function loadCatalog(root: string): Catalog {
  const issues: Issue[] = [];
  const validator = makeValidators(root);

  const index = readYaml<TaxonomyIndex>(root, join(root, "data/taxonomy/index.yaml"), "taxonomy_index", validator, issues) ?? {
    departments: [],
  };

  const departments = new Map<string, DepartmentSource>();
  let schemaFailed = false;
  for (const path of yamlFiles(join(root, "data/taxonomy/departments"))) {
    const data = readYaml<AuthoredNode>(root, path, "department_file", validator, issues);
    if (data) departments.set(basename(path, ".yaml"), { file: relative(root, path), data });
    else schemaFailed = true;
  }
  if (schemaFailed) {
    // Everything downstream would report the missing nodes again; stop here.
    issues.push({ level: "error", file: "data/", message: "fix the taxonomy file errors above; tree and store-type checks were skipped" });
    return { taxonomy: { roots: [], byId: new Map() }, storeTypes: [], issues };
  }
  const { taxonomy, issues: taxIssues } = buildTaxonomy(index, departments);
  issues.push(...taxIssues);

  const storeTypes: LoadedStoreType[] = [];
  for (const path of yamlFiles(join(root, "data/store-types"))) {
    const file = relative(root, path);
    const def = readYaml<StoreTypeFile>(root, path, "store_type_file", validator, issues);
    if (!def) continue;
    if (def.store_type !== basename(path, ".yaml")) {
      issues.push({ level: "error", file, where: def.store_type, message: `store_type "${def.store_type}" does not match its file name` });
      continue;
    }
    const { resolved, issues: stIssues } = resolveStoreType(def, file, taxonomy);
    issues.push(...stIssues);

    const matchPath = join(root, "data/matches", `${def.store_type}.csv`);
    const matchFile = relative(root, matchPath);
    let matches: MatchRow[] = [];
    if (existsSync(matchPath)) {
      const parsed = parseMatches(readFileSync(matchPath, "utf8"), matchFile, taxonomy);
      matches = parsed.rows;
      issues.push(...parsed.issues, ...checkMatchesAgainstStoreType(matches, matchFile, resolved));
    }
    storeTypes.push({ resolved, matchFile, matches });
  }

  for (const path of existsSync(join(root, "data/matches")) ? readdirSync(join(root, "data/matches")) : []) {
    if (path.endsWith(".csv") && !storeTypes.some((s) => s.resolved.def.store_type === basename(path, ".csv"))) {
      issues.push({ level: "error", file: `data/matches/${path}`, message: "no store-type file with this name" });
    }
  }

  return { taxonomy, storeTypes, issues };
}

export function formatIssue(i: Issue): string {
  const tag = i.level === "error" ? "error" : "warn ";
  return `${tag}  ${i.file}${i.where ? ` [${i.where}]` : ""}: ${i.message}`;
}
