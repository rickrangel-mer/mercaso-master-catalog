import { parse } from "csv-parse/sync";
import type { ResolvedStoreType } from "./store-type.ts";
import { isLeafKind } from "./taxonomy.ts";
import {
  MATCH_SOURCES,
  MATCH_STATUSES,
  type Issue,
  type LeafMatch,
  type MatchRow,
  type MatchSource,
  type MatchStatus,
  type Taxonomy,
} from "./types.ts";

export const MATCH_COLUMNS = [
  "node_id",
  "mercaso_sku",
  "case_pack",
  "rank",
  "confidence",
  "status",
  "source",
  "reviewer",
  "note",
] as const;

/** Parse and check a data/matches/<store-type>.csv file. Row numbers in issues are file line numbers. */
export function parseMatches(
  text: string,
  file: string,
  taxonomy: Taxonomy,
): { rows: MatchRow[]; issues: Issue[] } {
  const issues: Issue[] = [];
  let records: string[][];
  try {
    records = parse(text, { skip_empty_lines: true, relax_column_count: false }) as string[][];
  } catch (e) {
    issues.push({ level: "error", file, message: `CSV parse error: ${(e as Error).message}` });
    return { rows: [], issues };
  }
  const header = records[0];
  if (!header || header.join(",") !== MATCH_COLUMNS.join(",")) {
    issues.push({ level: "error", file, where: "line 1", message: `header must be exactly: ${MATCH_COLUMNS.join(",")}` });
    return { rows: [], issues };
  }

  const rows: MatchRow[] = [];
  const seen = new Set<string>();
  records.slice(1).forEach((rec, i) => {
    const where = `line ${i + 2}`;
    const err = (message: string) => issues.push({ level: "error", file, where, message });
    const [node_id = "", sku = "", casePack = "", rank = "", confidence = "", status = "", source = "", reviewer = "", note = ""] =
      rec.map((v) => v.trim());

    const node = taxonomy.byId.get(node_id);
    if (!node) return err(`node_id "${node_id}" is not a taxonomy node`);
    if (!isLeafKind(node.kind)) return err(`node_id "${node_id}" is a ${node.kind}; matches attach to size or assortment_slot leaves`);
    if (!sku) return err("mercaso_sku is empty");
    if (!(MATCH_STATUSES as readonly string[]).includes(status)) {
      return err(`status "${status}" must be one of: ${MATCH_STATUSES.join(", ")}`);
    }
    if (!(MATCH_SOURCES as readonly string[]).includes(source)) {
      return err(`source "${source}" must be one of: ${MATCH_SOURCES.join(", ")}`);
    }
    const intOrUndef = (value: string, field: string): number | undefined | null => {
      if (value === "") return undefined;
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) {
        err(`${field} "${value}" must be a positive whole number`);
        return null;
      }
      return n;
    };
    const casePackN = intOrUndef(casePack, "case_pack");
    const rankN = intOrUndef(rank, "rank");
    if (casePackN === null || rankN === null) return;
    let confidenceN: number | undefined;
    if (confidence !== "") {
      confidenceN = Number(confidence);
      if (!Number.isFinite(confidenceN) || confidenceN < 0 || confidenceN > 1) {
        return err(`confidence "${confidence}" must be between 0 and 1`);
      }
    }
    if (status !== "auto" && !reviewer) return err(`rows with status ${status} need a reviewer`);

    const dedupe = `${node_id}|${sku}|${casePackN ?? ""}`;
    if (seen.has(dedupe)) return err(`duplicate row for ${node_id} and SKU ${sku}`);
    seen.add(dedupe);

    rows.push({
      node_id,
      mercaso_sku: sku,
      ...(casePackN !== undefined ? { case_pack: casePackN } : {}),
      ...(rankN !== undefined ? { rank: rankN } : {}),
      ...(confidenceN !== undefined ? { confidence: confidenceN } : {}),
      status: status as MatchStatus,
      source: source as MatchSource,
      ...(reviewer ? { reviewer } : {}),
      ...(note ? { note } : {}),
    });
  });
  return { rows, issues };
}

/** Warn about rows for leaves the store type does not carry. */
export function checkMatchesAgainstStoreType(rows: MatchRow[], file: string, resolved: ResolvedStoreType): Issue[] {
  const carried = new Set(resolved.leaves.map((l) => l.node.id));
  return rows
    .filter((r) => !carried.has(r.node_id))
    .map((r) => ({
      level: "warning" as const,
      file,
      where: r.node_id,
      message: `match row for SKU ${r.mercaso_sku} points at a leaf the ${resolved.def.store_type} store type does not carry`,
    }));
}

/** Coverage per carried leaf. Branded: matched | gap. Assortment: covered (approved >= target min) | partial | gap. */
export function summarizeMatches(rows: MatchRow[], resolved: ResolvedStoreType): Map<string, LeafMatch> {
  const byNode = new Map<string, MatchRow[]>();
  for (const r of rows) {
    const list = byNode.get(r.node_id) ?? [];
    list.push(r);
    byNode.set(r.node_id, list);
  }

  const out = new Map<string, LeafMatch>();
  for (const leaf of resolved.leaves) {
    const list = (byNode.get(leaf.node.id) ?? []).slice().sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    const approved = list.filter((r) => r.status === "approved").length;
    const pending = list.filter((r) => r.status === "auto").length;
    const rejected = list.filter((r) => r.status === "rejected").length;
    let status: LeafMatch["status"];
    if (leaf.node.kind === "assortment_slot") {
      const min = leaf.node.attrs.target_count?.min ?? 1;
      status = approved >= min ? "covered" : approved > 0 ? "partial" : "gap";
    } else {
      status = approved > 0 ? "matched" : "gap";
    }
    out.set(leaf.node.id, {
      status,
      approved,
      pending,
      rejected,
      skus: list
        .filter((r) => r.status !== "rejected")
        .map((r) => ({
          sku: r.mercaso_sku,
          status: r.status,
          ...(r.rank !== undefined ? { rank: r.rank } : {}),
          ...(r.case_pack !== undefined ? { case_pack: r.case_pack } : {}),
        })),
    });
  }
  return out;
}
