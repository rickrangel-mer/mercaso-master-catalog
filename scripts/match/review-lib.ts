// Review sheets: pure logic for `pnpm review`. Export turns the match file into two CSVs a person
// fills in (pending matches to approve or reject, gaps to write a SKU against); import applies them.
import type { OutputNode } from "../lib/output.ts";

/** One row of data/matches/<store-type>.csv, as strings keyed by column. */
export type MatchRecord = Record<string, string>;

export interface LeafInfo {
  id: string;
  department: string;
  /** Path below the department: "Cola › Coca-Cola › Classic › 20oz bottle". */
  item: string;
  priority: string;
  kind: "Branded" | "Slot";
  target: string;
  brandHints: string;
}

/** Carried leaves in catalog order. */
export function leafInfo(departments: OutputNode[]): LeafInfo[] {
  const out: LeafInfo[] = [];
  const walk = (n: OutputNode, dept: string, path: string[]) => {
    if (!n.children || n.children.length === 0) {
      if (!n.priority) return;
      const t = n.attrs.target_count;
      out.push({
        id: n.id,
        department: dept,
        item: [...path, n.name].join(" › "),
        priority: n.priority,
        kind: n.kind === "assortment_slot" ? "Slot" : "Branded",
        target: t ? (t.min === t.max ? `${t.min}` : `${t.min}-${t.max}`) : "",
        brandHints: n.attrs.brand_hints?.join(", ") ?? "",
      });
      return;
    }
    for (const c of n.children) walk(c, dept, [...path, n.name]);
  };
  for (const d of departments) for (const c of d.children ?? []) walk(c, d.name, []);
  return out;
}

const pct = (s: string | undefined) => (s ? (Number(s) * 100).toFixed(1) : "");

export const PENDING_COLUMNS = [
  "decision",
  "department",
  "catalog_item",
  "priority",
  "type",
  "mercaso_sku",
  "product",
  "case_pack",
  "confidence",
  "store_share_12m_pct",
  "store_share_90d_pct",
  "note",
  "node_id",
] as const;

export const GAP_COLUMNS = [
  "mercaso_sku",
  "department",
  "catalog_item",
  "priority",
  "type",
  "target_skus",
  "brand_hints",
  "note",
  "node_id",
] as const;

/** Pending (auto) matches, grouped by item in catalog order, best first. `decision` starts empty. */
export function pendingSheet(leaves: LeafInfo[], matches: MatchRecord[]): string[][] {
  const rows: string[][] = [[...PENDING_COLUMNS]];
  for (const l of leaves) {
    const list = matches.filter((m) => m.node_id === l.id && m.status === "auto").sort((a, b) => Number(a.rank) - Number(b.rank));
    for (const m of list) {
      rows.push([
        "",
        l.department,
        l.item,
        l.priority,
        l.kind,
        m.mercaso_sku ?? "",
        m.title ?? "",
        m.case_pack ?? "",
        m.confidence ?? "",
        pct(m.share_12m),
        pct(m.share_90d),
        "",
        l.id,
      ]);
    }
  }
  return rows;
}

/** Items with no SKU at all (rejected rows don't count), must first. `mercaso_sku` starts empty. */
export function gapSheet(leaves: LeafInfo[], matches: MatchRecord[]): string[][] {
  const withSku = new Set(matches.filter((m) => m.status !== "rejected").map((m) => m.node_id));
  const order = ["must", "should", "nice"];
  const gaps = leaves.filter((l) => !withSku.has(l.id)).sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));
  return [[...GAP_COLUMNS], ...gaps.map((l) => ["", l.department, l.item, l.priority, l.kind, l.target, l.brandHints, "", l.id])];
}

export interface Product {
  sku: string;
  title: string;
  casePack: string;
  active: boolean;
}

export interface ImportResult {
  matches: MatchRecord[];
  approved: number;
  rejected: number;
  added: number;
  problems: string[];
}

/** SKUs written in a gap cell: separated by spaces, commas, semicolons or "|". */
export const splitSkus = (cell: string) => cell.split(/[\s,;|]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);

/**
 * Applies filled-in sheets to the match rows. Pending: decision approve/yes/y or reject/no/n.
 * Gaps: each SKU becomes a manual, approved row. Unknown or inactive SKUs are reported and skipped.
 */
export function applyReview(
  matches: MatchRecord[],
  pending: Record<string, string>[],
  gaps: Record<string, string>[],
  products: Map<string, Product> | null,
  reviewer: string,
  date: string,
): ImportResult {
  const out = matches.map((m) => ({ ...m }));
  const problems: string[] = [];
  let approved = 0;
  let rejected = 0;
  let added = 0;
  const stamp = (note: string, extra: string) => [note, extra].filter(Boolean).join(" · ");

  for (const p of pending) {
    const d = (p.decision ?? "").trim().toLowerCase();
    if (!d) continue;
    const verdict = ["approve", "approved", "yes", "y"].includes(d) ? "approved" : ["reject", "rejected", "no", "n"].includes(d) ? "rejected" : null;
    if (!verdict) {
      problems.push(`pending ${p.node_id} ${p.mercaso_sku}: decision "${p.decision}" is not approve or reject`);
      continue;
    }
    const row = out.find((m) => m.node_id === p.node_id && m.mercaso_sku === p.mercaso_sku && m.status === "auto");
    if (!row) {
      problems.push(`pending ${p.node_id} ${p.mercaso_sku}: no pending row with that item and SKU`);
      continue;
    }
    row.status = verdict;
    row.reviewer = reviewer;
    row.note = stamp(row.note ?? "", stamp((p.note ?? "").trim(), `Review sheet (${reviewer}, ${date})`));
    if (verdict === "approved") approved++;
    else rejected++;
  }

  for (const g of gaps) {
    for (const sku of splitSkus(g.mercaso_sku ?? "")) {
      const product = products?.get(sku);
      if (products && !product) {
        problems.push(`gap ${g.node_id}: SKU ${sku} is not in products.csv`);
        continue;
      }
      if (product && !product.active) problems.push(`gap ${g.node_id}: SKU ${sku} is not ACTIVE (added anyway)`);
      if (out.some((m) => m.node_id === g.node_id && m.mercaso_sku === sku && m.status !== "rejected")) continue;
      const existing = out.find((m) => m.node_id === g.node_id && m.mercaso_sku === sku);
      const row: MatchRecord = {
        node_id: g.node_id ?? "",
        mercaso_sku: sku,
        title: product?.title ?? "",
        case_pack: product?.casePack ?? "",
        rank: String(out.filter((m) => m.node_id === g.node_id && m.status !== "rejected").length + 1),
        confidence: "1.00",
        share_12m: "",
        share_90d: "",
        status: "approved",
        source: "manual",
        reviewer,
        note: stamp((g.note ?? "").trim(), `Added from the gap sheet (${reviewer}, ${date})`),
      };
      if (existing) Object.assign(existing, row);
      else out.push(row);
      added++;
    }
  }
  return { matches: out, approved, rejected, added, problems };
}
