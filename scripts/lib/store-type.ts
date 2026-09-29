import { isLeafKind, isWithin } from "./taxonomy.ts";
import type { Issue, Priority, StoreTypeFile, Taxonomy, TaxonomyNode } from "./types.ts";

export interface ResolvedNode {
  node: TaxonomyNode;
  /** True when the store type carries this node; false for ancestors kept only as containers. */
  carried: boolean;
  priority?: Priority;
  prioritySource?: "explicit" | "inherited";
  storeNote?: string;
  /** Effective flags, inherited down the tree. */
  ageRestricted: boolean;
  restricted: string[];
  children: ResolvedNode[];
}

export interface ResolvedStoreType {
  file: string;
  def: StoreTypeFile;
  roots: ResolvedNode[];
  /** Carried leaves (sizes and assortment slots), in tree order. */
  leaves: ResolvedNode[];
  /** Node ids dropped because they are restricted in the store type's state. */
  droppedRestricted: string[];
}

interface Inherited {
  carried: boolean;
  priority?: Priority;
  ageRestricted: boolean;
  restricted: string[];
}

export function resolveStoreType(
  def: StoreTypeFile,
  file: string,
  taxonomy: Taxonomy,
): { resolved: ResolvedStoreType; issues: Issue[] } {
  const issues: Issue[] = [];
  const err = (where: string, message: string) => issues.push({ level: "error", file, where, message });
  const { byId } = taxonomy;

  const include = new Set(def.include);
  const exclude = new Set(def.exclude ?? []);
  const priority = def.priority ?? {};
  const notes = def.notes ?? {};

  const known = (id: string, field: string) => {
    if (byId.has(id)) return true;
    err(id, `${field} refers to "${id}", which is not a taxonomy node`);
    return false;
  };
  for (const id of include) known(id, "include");
  for (const id of exclude) known(id, "exclude");
  for (const id of Object.keys(priority)) known(id, "priority");
  for (const id of Object.keys(notes)) known(id, "notes");

  for (const a of include) {
    for (const b of include) {
      if (a !== b && isWithin(a, b)) err(a, `include "${a}" is already covered by include "${b}"`);
    }
  }
  for (const id of exclude) {
    if (![...include].some((inc) => isWithin(id, inc) && id !== inc)) {
      err(id, `exclude "${id}" is not inside any included subtree`);
    }
  }

  const leaves: ResolvedNode[] = [];
  const droppedRestricted: string[] = [];
  const present = new Map<string, ResolvedNode>();

  const build = (node: TaxonomyNode, inh: Inherited): ResolvedNode | null => {
    if (exclude.has(node.id)) return null;
    const restrictedHere = node.attrs.restricted ?? [];
    if (def.state && restrictedHere.includes(def.state)) {
      droppedRestricted.push(node.id);
      return null;
    }

    const carried = inh.carried || include.has(node.id);
    const explicit = carried ? priority[node.id] : undefined;
    const resolvedPriority = explicit ?? (carried ? inh.priority : undefined);
    const ageRestricted = inh.ageRestricted || node.attrs.age_restricted === true;
    const restricted = [...new Set([...inh.restricted, ...restrictedHere])];

    const children: ResolvedNode[] = [];
    let excludedChild = false;
    for (const child of node.children) {
      const built = build(child, { carried, priority: resolvedPriority, ageRestricted, restricted });
      if (built) children.push(built);
      else if (exclude.has(child.id)) excludedChild = true;
    }

    if (!carried && children.length === 0) return null;
    if (node.children.length > 0 && children.length === 0) {
      if (excludedChild) {
        err(node.id, `everything under "${node.id}" is excluded; exclude "${node.id}" itself instead`);
      } else {
        droppedRestricted.push(node.id);
      }
      return null;
    }

    const out: ResolvedNode = {
      node,
      carried,
      ...(resolvedPriority ? { priority: resolvedPriority, prioritySource: explicit ? "explicit" : "inherited" } : {}),
      ...(notes[node.id] ? { storeNote: notes[node.id] } : {}),
      ageRestricted,
      restricted,
      children,
    };
    present.set(node.id, out);

    if (carried && explicit && inh.priority === explicit) {
      issues.push({
        level: "warning",
        file,
        where: node.id,
        message: `priority "${explicit}" is the same as the inherited priority; the line can be removed`,
      });
    }
    if (carried && isLeafKind(node.kind)) {
      if (!resolvedPriority) err(node.id, "leaf has no priority (set one on it or an ancestor)");
      leaves.push(out);
    }
    return out;
  };

  const roots: ResolvedNode[] = [];
  for (const root of taxonomy.roots) {
    const built = build(root, { carried: false, ageRestricted: false, restricted: [] });
    if (built) roots.push(built);
  }

  const dropped = new Set(droppedRestricted);
  const isDropped = (id: string) => [...dropped].some((d) => isWithin(id, d));
  for (const [field, map] of [["priority", priority], ["notes", notes]] as const) {
    for (const id of Object.keys(map)) {
      if (!byId.has(id) || isDropped(id)) continue;
      const r = present.get(id);
      if (!r || !r.carried) err(id, `${field} is set on "${id}", which this store type does not carry`);
    }
  }

  return { resolved: { file, def, roots, leaves, droppedRestricted }, issues };
}
