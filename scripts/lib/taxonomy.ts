import type {
  AuthoredKind,
  AuthoredNode,
  Issue,
  Kind,
  NodeAttrs,
  SizeDef,
  Taxonomy,
  TaxonomyIndex,
  TaxonomyNode,
} from "./types.ts";

/** Which authored kinds may sit directly under each kind. */
const ALLOWED_CHILDREN: Record<AuthoredKind, AuthoredKind[]> = {
  department: ["category"],
  category: ["subcategory", "brand_line", "assortment_slot"],
  subcategory: ["subcategory", "brand_line", "assortment_slot"],
  brand_line: ["variant"],
  variant: [],
  assortment_slot: [],
};

const SLOT_ONLY = ["target_count", "mix", "size_class", "brand_hints"] as const;
const SCOPE_KINDS: AuthoredKind[] = ["department", "category", "subcategory", "brand_line"];

export interface DepartmentSource {
  file: string;
  data: AuthoredNode;
}

interface Scope {
  sizeClasses?: Record<string, string>;
  sizeDefs: Record<string, SizeDef>;
  brandLineSizes?: string[];
}

export function isLeafKind(kind: Kind): boolean {
  return kind === "size" || kind === "assortment_slot";
}

export function buildTaxonomy(
  index: TaxonomyIndex,
  departments: Map<string, DepartmentSource>,
): { taxonomy: Taxonomy; issues: Issue[] } {
  const issues: Issue[] = [];
  const byId = new Map<string, TaxonomyNode>();
  const roots: TaxonomyNode[] = [];

  for (const deptKey of index.departments) {
    const source = departments.get(deptKey);
    if (!source) {
      issues.push({
        level: "error",
        file: "data/taxonomy/index.yaml",
        where: deptKey,
        message: `department "${deptKey}" is listed but data/taxonomy/departments/${deptKey}.yaml does not exist`,
      });
      continue;
    }
    if (source.data.key !== deptKey) {
      issues.push({
        level: "error",
        file: source.file,
        where: source.data.key,
        message: `department key "${source.data.key}" does not match its file name "${deptKey}"`,
      });
      continue;
    }
    const root = walk(source.data, null, { sizeDefs: {} }, source.file, byId, issues);
    if (root) roots.push(root);
  }

  for (const [key, source] of departments) {
    if (!index.departments.includes(key)) {
      issues.push({
        level: "error",
        file: source.file,
        where: key,
        message: `department file exists but "${key}" is not listed in data/taxonomy/index.yaml`,
      });
    }
  }

  checkCrossRefs(byId, issues);
  return { taxonomy: { roots, byId }, issues };
}

function walk(
  node: AuthoredNode,
  parent: TaxonomyNode | null,
  parentScope: Scope,
  file: string,
  byId: Map<string, TaxonomyNode>,
  issues: Issue[],
): TaxonomyNode | null {
  const id = parent ? `${parent.id}.${node.key}` : node.key;
  const err = (message: string) => issues.push({ level: "error", file, where: id, message });

  if (byId.has(id)) {
    err(`duplicate id "${id}"; sibling keys must be unique`);
    return null;
  }

  const kind = node.kind;
  if (parent && !ALLOWED_CHILDREN[parent.kind as AuthoredKind].includes(kind)) {
    err(`a ${kind} cannot sit under a ${parent.kind}`);
  }
  if (!parent && kind !== "department") err(`top-level node must be a department, got ${kind}`);

  // Kind-specific attribute rules.
  if (kind !== "assortment_slot") {
    for (const attr of SLOT_ONLY) {
      if (node[attr] !== undefined) err(`\`${attr}\` only applies to assortment_slot nodes`);
    }
  }
  if (node.sizes !== undefined && kind !== "brand_line" && kind !== "variant") {
    err("`sizes` only applies to brand_line and variant nodes");
  }
  if ((node.size_defs || node.size_classes) && !SCOPE_KINDS.includes(kind)) {
    err("`size_defs` and `size_classes` belong on a department, category, subcategory or brand_line");
  }

  // Scope: size classes replace the inherited vocabulary; size defs extend it.
  const scope: Scope = {
    sizeClasses: node.size_classes ?? parentScope.sizeClasses,
    sizeDefs: { ...parentScope.sizeDefs, ...(node.size_defs ?? {}) },
    brandLineSizes: kind === "brand_line" ? node.sizes : parentScope.brandLineSizes,
  };
  for (const [defKey, def] of Object.entries(node.size_defs ?? {})) {
    if (!scope.sizeClasses) {
      err(`size def "${defKey}" has no size_classes vocabulary in scope`);
    } else if (!(def.size_class in scope.sizeClasses)) {
      err(`size def "${defKey}" uses size class "${def.size_class}", not one of: ${Object.keys(scope.sizeClasses).join(", ")}`);
    }
  }

  const attrs: NodeAttrs = {};
  if (node.verify) attrs.verify = node.verify;
  if (node.age_restricted !== undefined) attrs.age_restricted = node.age_restricted;
  if (node.restricted) attrs.restricted = node.restricted;
  if (node.cross_ref) attrs.cross_ref = node.cross_ref;
  if (node.size_classes) attrs.size_classes = node.size_classes;

  if (kind === "assortment_slot") {
    if (!node.target_count) {
      err("assortment_slot needs a target_count");
    } else {
      if (node.target_count.min > node.target_count.max) {
        err(`target_count min ${node.target_count.min} is greater than max ${node.target_count.max}`);
      }
      attrs.target_count = node.target_count;
    }
    if (node.mix) attrs.mix = node.mix;
    if (node.brand_hints) attrs.brand_hints = node.brand_hints;
    if (node.size_class) {
      for (const sc of node.size_class) {
        if (!scope.sizeClasses) err(`size class "${sc}" used with no size_classes vocabulary in scope`);
        else if (!(sc in scope.sizeClasses)) {
          err(`size class "${sc}" is not one of: ${Object.keys(scope.sizeClasses).join(", ")}`);
        }
      }
      attrs.size_class = node.size_class;
    }
  }

  const out: TaxonomyNode = {
    id,
    key: node.key,
    name: node.name,
    kind,
    ...(node.note ? { note: node.note } : {}),
    attrs,
    parentId: parent?.id ?? null,
    children: [],
    file,
  };
  byId.set(id, out);

  if (kind === "variant") {
    if (node.children) err("a variant's leaves come from `sizes`; it cannot have children");
    const sizes = node.sizes ?? scope.brandLineSizes;
    if (!sizes || sizes.length === 0) {
      err("variant has no sizes (set `sizes` on the variant or its brand line)");
    } else {
      for (const sizeKey of sizes) {
        const def = scope.sizeDefs[sizeKey];
        if (!def) {
          err(`size "${sizeKey}" is not defined in any size_defs in scope`);
          continue;
        }
        const sizeId = `${id}.${sizeKey}`;
        const sizeNode: TaxonomyNode = {
          id: sizeId,
          key: sizeKey,
          name: def.name,
          kind: "size",
          attrs: {
            size_class: def.size_class,
            ...(def.container ? { container: def.container } : {}),
            ...(def.volume_ml !== undefined ? { volume_ml: def.volume_ml } : {}),
            ...(def.unit_count !== undefined ? { unit_count: def.unit_count } : {}),
          },
          parentId: id,
          children: [],
          file,
        };
        byId.set(sizeId, sizeNode);
        out.children.push(sizeNode);
      }
    }
    return out;
  }

  if (kind === "assortment_slot") {
    if (node.children) err("an assortment_slot is a leaf; it cannot have children");
    return out;
  }

  if (!node.children || node.children.length === 0) {
    // A category or subcategory may be a pure link to canonical nodes elsewhere (rule 10).
    const isLink = node.cross_ref !== undefined && (kind === "category" || kind === "subcategory");
    if (!isLink) err(`a ${kind} needs at least one child, or a cross_ref if it only points elsewhere`);
    return out;
  }
  for (const child of node.children) {
    const built = walk(child, out, scope, file, byId, issues);
    if (built) out.children.push(built);
  }
  return out;
}

function checkCrossRefs(byId: Map<string, TaxonomyNode>, issues: Issue[]): void {
  for (const node of byId.values()) {
    for (const ref of node.attrs.cross_ref ?? []) {
      const err = (message: string) => issues.push({ level: "error", file: node.file, where: node.id, message });
      if (!byId.has(ref)) err(`cross_ref "${ref}" does not resolve to a node`);
      else if (ref === node.id || ref.startsWith(`${node.id}.`) || node.id.startsWith(`${ref}.`)) {
        err(`cross_ref "${ref}" points at the node itself, an ancestor or a descendant`);
      }
    }
  }
}

/** All ancestors of a node, nearest first. */
export function ancestors(node: TaxonomyNode, byId: Map<string, TaxonomyNode>): TaxonomyNode[] {
  const out: TaxonomyNode[] = [];
  let cur = node.parentId ? byId.get(node.parentId) : undefined;
  while (cur) {
    out.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

export function isWithin(id: string, ancestorId: string): boolean {
  return id === ancestorId || id.startsWith(`${ancestorId}.`);
}
