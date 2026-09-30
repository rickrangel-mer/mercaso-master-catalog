// Pure helpers for the Athena runner: config from the environment, SQL cleanup, result paging
// into rows, and CSV writing. No network calls here, so it is unit tested.
import type { ResultSet } from "@aws-sdk/client-athena";

export interface AthenaConfig {
  region: string;
  workgroup: string;
  outputLocation?: string;
}

/**
 * Reads Athena settings from the environment. The S3 results path is ATHENA_S3_STAGING_DIR
 * (ATHENA_OUTPUT_LOCATION also works). It may be omitted when the workgroup sets its own.
 */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): { config?: AthenaConfig; missing: string[] } {
  const region = env.AWS_REGION?.trim() || env.AWS_DEFAULT_REGION?.trim();
  const workgroup = env.ATHENA_WORKGROUP?.trim() || "primary";
  const outputLocation = env.ATHENA_S3_STAGING_DIR?.trim() || env.ATHENA_OUTPUT_LOCATION?.trim() || undefined;
  const missing: string[] = [];
  if (!region) missing.push("AWS_REGION");
  if (!env.AWS_ACCESS_KEY_ID?.trim()) missing.push("AWS_ACCESS_KEY_ID");
  if (!env.AWS_SECRET_ACCESS_KEY?.trim()) missing.push("AWS_SECRET_ACCESS_KEY");
  if (missing.length > 0) return { missing };
  return { config: { region: region!, workgroup, ...(outputLocation ? { outputLocation } : {}) }, missing };
}

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/**
 * Credentials from the environment. A session token only belongs with temporary keys (ASIA...);
 * sent with a long-term IAM user key (AKIA...), AWS rejects the pair as InvalidClientTokenId.
 * So a stray token next to an AKIA key is ignored, with a warning.
 */
export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): { credentials: AwsCredentials; warning?: string } {
  const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim() ?? "";
  const sessionToken = env.AWS_SESSION_TOKEN?.trim() || undefined;
  if (sessionToken && accessKeyId.startsWith("AKIA")) {
    return {
      credentials: { accessKeyId, secretAccessKey },
      warning: "Ignoring AWS_SESSION_TOKEN: the access key is a long-term key (AKIA...), which takes no session token. Remove AWS_SESSION_TOKEN from the environment settings.",
    };
  }
  return { credentials: { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) } };
}

/** Athena runs one statement per call and rejects a trailing semicolon; comments are fine. */
export function prepareSql(sql: string): string {
  return sql.trim().replace(/;\s*$/, "");
}

/**
 * Fills the {{CATALOG_SKUS}} placeholder with a quoted SKU list. SKUs are checked against a strict
 * pattern first, so nothing from the match file can change the query's meaning.
 */
export function fillCatalogSkus(sql: string, skus: string[]): string {
  if (!sql.includes("{{CATALOG_SKUS}}")) return sql;
  const list = [...new Set(skus)].sort();
  if (list.length === 0) throw new Error("{{CATALOG_SKUS}}: the match file has no SKUs");
  const bad = list.filter((s) => !/^[A-Za-z0-9_-]+$/.test(s));
  if (bad.length > 0) throw new Error(`{{CATALOG_SKUS}}: unexpected characters in SKU(s) ${bad.slice(0, 5).join(", ")}`);
  return sql.replaceAll("{{CATALOG_SKUS}}", list.map((s) => `'${s}'`).join(", "));
}

/** Turns one page of GetQueryResults into rows of strings. The first page's first row is the header. */
export function pageToRows(resultSet: ResultSet | undefined): string[][] {
  return (resultSet?.Rows ?? []).map((r) => (r.Data ?? []).map((d) => d.VarCharValue ?? ""));
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

/** Plain-language hints for the errors people actually hit when wiring up credentials. */
export function explainAwsError(e: unknown): string {
  const err = e as { name?: string; message?: string };
  const name = err.name ?? "Error";
  const hints: Record<string, string> = {
    InvalidClientTokenId: "AWS rejected the access key. Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in the environment settings, and that AWS_SESSION_TOKEN is set only for temporary keys (ASIA...).",
    SignatureDoesNotMatch: "The secret key does not match the access key. Re-copy AWS_SECRET_ACCESS_KEY.",
    ExpiredToken: "The temporary credentials have expired. Refresh AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN.",
    ExpiredTokenException: "The temporary credentials have expired. Refresh AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN.",
    UnrecognizedClientException: "AWS did not accept the credentials. If they are temporary, AWS_SESSION_TOKEN must be set too.",
    AccessDeniedException: "The key works but lacks a permission; the message below names it.",
    InvalidRequestException: "Athena rejected the request; the message below says why (often the workgroup or the S3 results path).",
  };
  return `${name}: ${hints[name] ?? ""}${hints[name] ? "\n  " : ""}${err.message ?? String(e)}`;
}
