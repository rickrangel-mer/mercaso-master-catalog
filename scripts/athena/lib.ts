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

/** Athena runs one statement per call and rejects a trailing semicolon; comments are fine. */
export function prepareSql(sql: string): string {
  return sql.trim().replace(/;\s*$/, "");
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
    InvalidClientTokenId: "AWS rejected the access key. Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in the environment settings.",
    SignatureDoesNotMatch: "The secret key does not match the access key. Re-copy AWS_SECRET_ACCESS_KEY.",
    ExpiredToken: "The temporary credentials have expired. Refresh AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN.",
    ExpiredTokenException: "The temporary credentials have expired. Refresh AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN.",
    UnrecognizedClientException: "AWS did not accept the credentials. If they are temporary, AWS_SESSION_TOKEN must be set too.",
    AccessDeniedException: "The key works but lacks a permission; the message below names it.",
    InvalidRequestException: "Athena rejected the request; the message below says why (often the workgroup or the S3 results path).",
  };
  return `${name}: ${hints[name] ?? ""}${hints[name] ? "\n  " : ""}${err.message ?? String(e)}`;
}
