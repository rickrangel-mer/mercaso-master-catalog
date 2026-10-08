/**
 * Runs the Athena queries in scripts/athena/sql/ and saves the results under data/raw/.
 *
 *   pnpm athena:check              confirm the credentials and Athena access
 *   pnpm athena:export             run every export (products, liquor sales, pricing, stores, members)
 *   pnpm athena:export products    run one export by name
 *
 * Settings come from the environment: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, optional
 * AWS_SESSION_TOKEN (temporary keys only; ignored next to an AKIA key), AWS_REGION, ATHENA_WORKGROUP, ATHENA_S3_STAGING_DIR. Credentials are read
 * from those variables directly, so a stray AWS_PROFILE cannot redirect them.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
} from "@aws-sdk/client-athena";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { parse } from "csv-parse/sync";
import { configFromEnv, credentialsFromEnv, explainAwsError, fillCatalogSkus, pageToRows, prepareSql, toCsv, type AthenaConfig } from "./lib.ts";

const ROOT = process.cwd();
const EXPORTS: Record<string, { sql: string; out: string }> = {
  products: { sql: "scripts/athena/sql/products.sql", out: "data/raw/products.csv" },
  "liquor-sales": { sql: "scripts/athena/sql/liquor_sales_by_sku.sql", out: "data/raw/liquor_sales_by_sku.csv" },
  "liquor-reach": { sql: "scripts/athena/sql/liquor_reach_by_category.sql", out: "data/raw/liquor_reach_by_category.csv" },
  pricing: { sql: "scripts/athena/sql/pricing.sql", out: "data/raw/pricing.csv" },
  "liquor-stores": { sql: "scripts/athena/sql/liquor_stores.sql", out: "data/raw/liquor_stores.csv" },
  "liquor-store-skus": { sql: "scripts/athena/sql/liquor_store_skus.sql", out: "data/raw/liquor_store_skus.csv" },
  "member-stores": { sql: "scripts/athena/sql/member_stores.sql", out: "data/raw/member_stores.csv" },
  "member-store-skus": { sql: "scripts/athena/sql/member_store_skus.sql", out: "data/raw/member_store_skus.csv" },
};

/** Every SKU in the liquor match file that is not rejected, for {{CATALOG_SKUS}}. */
const catalogSkus = (): string[] =>
  (parse(readFileSync(join(ROOT, "data/matches/liquor.csv"), "utf8"), { columns: true }) as Record<string, string>[])
    .filter((r) => r.status !== "rejected")
    .map((r) => r.mercaso_sku ?? "");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runQuery(client: AthenaClient, config: AthenaConfig, sql: string, label: string): Promise<string[][]> {
  const started = Date.now();
  const { QueryExecutionId: id } = await client.send(
    new StartQueryExecutionCommand({
      QueryString: prepareSql(sql),
      WorkGroup: config.workgroup,
      ...(config.outputLocation ? { ResultConfiguration: { OutputLocation: config.outputLocation } } : {}),
    }),
  );
  if (!id) throw new Error("Athena returned no query id");

  for (;;) {
    const { QueryExecution: q } = await client.send(new GetQueryExecutionCommand({ QueryExecutionId: id }));
    const state = q?.Status?.State;
    if (state === "SUCCEEDED") {
      const mb = ((q?.Statistics?.DataScannedInBytes ?? 0) / 1e6).toFixed(1);
      console.log(`  ${label}: done in ${((Date.now() - started) / 1000).toFixed(0)}s, scanned ${mb} MB`);
      break;
    }
    if (state === "FAILED" || state === "CANCELLED") {
      throw new Error(`${label} ${state}: ${q?.Status?.StateChangeReason ?? "no reason given"}`);
    }
    await sleep(1500);
  }

  const rows: string[][] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new GetQueryResultsCommand({ QueryExecutionId: id, NextToken: token, MaxResults: 1000 }));
    rows.push(...pageToRows(page.ResultSet));
    token = page.NextToken;
  } while (token);
  return rows;
}

async function main() {
  const [command = "check", ...names] = process.argv.slice(2);
  const { config, missing } = configFromEnv();
  if (!config) {
    console.error(`Missing environment variables: ${missing.join(", ")}.`);
    console.error("Add them in the cloud environment settings, then start a new session.");
    process.exit(1);
  }
  const { credentials, warning } = credentialsFromEnv();
  if (warning) console.warn(warning);
  const athena = new AthenaClient({ region: config.region, credentials });

  if (command === "check") {
    const who = await new STSClient({ region: config.region, credentials }).send(new GetCallerIdentityCommand({}));
    console.log(`AWS account ${who.Account}, identity ${who.Arn?.split("/").pop() ?? "?"}`);
    console.log(`Region ${config.region}, workgroup ${config.workgroup}, results ${config.outputLocation ?? "(workgroup default)"}`);
    const rows = await runQuery(athena, config, "SELECT count(*) AS items FROM dim.dim_item_item_info_full WHERE dt = (SELECT max(dt) FROM dim.dim_item_item_info_full)", "item count");
    console.log(`Athena works: ${rows[1]?.[0] ?? "?"} items in the latest item snapshot.`);
    return;
  }

  if (command !== "export") {
    console.error(`Unknown command "${command}". Use check or export.`);
    process.exit(1);
  }
  const selected = names.length > 0 ? names : Object.keys(EXPORTS);
  for (const name of selected) {
    const job = EXPORTS[name];
    if (!job) {
      console.error(`Unknown export "${name}". Known: ${Object.keys(EXPORTS).join(", ")}.`);
      process.exit(1);
    }
    const sql = readFileSync(join(ROOT, job.sql), "utf8");
    const rows = await runQuery(athena, config, sql.includes("{{CATALOG_SKUS}}") ? fillCatalogSkus(sql, catalogSkus()) : sql, name);
    mkdirSync(join(ROOT, "data/raw"), { recursive: true });
    writeFileSync(join(ROOT, job.out), toCsv(rows));
    console.log(`  wrote ${job.out}: ${Math.max(0, rows.length - 1)} rows`);
  }
}

main().catch((e) => {
  console.error(explainAwsError(e));
  process.exit(1);
});
