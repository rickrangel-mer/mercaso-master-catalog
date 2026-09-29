import type { ResolvedNode, ResolvedStoreType } from "./store-type.ts";
import type { CoverageStatus, Kind, LeafMatch, NodeAttrs, Priority } from "./types.ts";

export const OUTPUT_SCHEMA_VERSION = 1;

export interface OutputNode {
  id: string;
  key: string;
  name: string;
  kind: Kind;
  priority?: Priority;
  priority_source?: "explicit" | "inherited";
  note?: string;
  store_note?: string;
  attrs: NodeAttrs;
  match?: LeafMatch;
  children?: OutputNode[];
}

export interface StoreTypeCatalog {
  schema_version: number;
  store_type: string;
  name: string;
  description?: string;
  state?: string;
  summary: {
    leaves: number;
    by_kind: Record<"size" | "assortment_slot", number>;
    by_priority: Record<Priority, number>;
    match: Record<CoverageStatus, number>;
    verify: { sales: number; stock: number };
    dropped_restricted: string[];
  };
  departments: OutputNode[];
}

export function buildCatalogJson(resolved: ResolvedStoreType, matches: Map<string, LeafMatch>): StoreTypeCatalog {
  const summary: StoreTypeCatalog["summary"] = {
    leaves: resolved.leaves.length,
    by_kind: { size: 0, assortment_slot: 0 },
    by_priority: { must: 0, should: 0, nice: 0 },
    match: { matched: 0, covered: 0, partial: 0, gap: 0 },
    verify: { sales: 0, stock: 0 },
    dropped_restricted: resolved.droppedRestricted,
  };

  const toOutput = (r: ResolvedNode): OutputNode => {
    const { node } = r;
    const attrs: NodeAttrs = { ...node.attrs };
    if (r.ageRestricted) attrs.age_restricted = true;
    else delete attrs.age_restricted;
    if (r.restricted.length > 0) attrs.restricted = r.restricted;
    if (node.attrs.verify) summary.verify[node.attrs.verify] += 1;

    const out: OutputNode = {
      id: node.id,
      key: node.key,
      name: node.name,
      kind: node.kind,
      ...(r.priority ? { priority: r.priority, priority_source: r.prioritySource } : {}),
      ...(node.note ? { note: node.note } : {}),
      ...(r.storeNote ? { store_note: r.storeNote } : {}),
      attrs,
    };

    if (r.carried && (node.kind === "size" || node.kind === "assortment_slot")) {
      summary.by_kind[node.kind] += 1;
      if (r.priority) summary.by_priority[r.priority] += 1;
      const match = matches.get(node.id);
      if (match) {
        out.match = match;
        summary.match[match.status] += 1;
      }
    }
    if (r.children.length > 0) out.children = r.children.map(toOutput);
    return out;
  };

  return {
    schema_version: OUTPUT_SCHEMA_VERSION,
    store_type: resolved.def.store_type,
    name: resolved.def.name,
    ...(resolved.def.description ? { description: resolved.def.description } : {}),
    ...(resolved.def.state ? { state: resolved.def.state } : {}),
    summary,
    departments: resolved.roots.map(toOutput),
  };
}
