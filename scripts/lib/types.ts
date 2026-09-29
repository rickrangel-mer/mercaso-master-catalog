export const PRIORITIES = ["must", "should", "nice"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const MIX_VALUES = ["value", "national", "hispanic"] as const;
export type Mix = (typeof MIX_VALUES)[number];

export type AuthoredKind =
  | "department"
  | "category"
  | "subcategory"
  | "brand_line"
  | "variant"
  | "assortment_slot";

/** `size` nodes are generated from `sizes` lists; they are never authored. */
export type Kind = AuthoredKind | "size";

export type LeafKind = "size" | "assortment_slot";

export interface SizeDef {
  name: string;
  size_class: string;
  container?: string;
  volume_ml?: number;
  unit_count?: number;
}

/** A node as written in data/taxonomy/departments/*.yaml. */
export interface AuthoredNode {
  key: string;
  name: string;
  kind: AuthoredKind;
  note?: string;
  verify?: "sales" | "stock";
  age_restricted?: boolean;
  restricted?: string[];
  cross_ref?: string[];
  size_classes?: Record<string, string>;
  size_defs?: Record<string, SizeDef>;
  sizes?: string[];
  target_count?: { min: number; max: number };
  mix?: Mix[];
  size_class?: string[];
  brand_hints?: string[];
  children?: AuthoredNode[];
}

export interface TaxonomyIndex {
  departments: string[];
}

export interface StoreTypeFile {
  store_type: string;
  name: string;
  description?: string;
  state?: string;
  include: string[];
  exclude?: string[];
  priority: Record<string, Priority>;
  notes?: Record<string, string>;
}

/** Attributes carried into the built JSON. Only the ones that apply to a node are set. */
export interface NodeAttrs {
  verify?: "sales" | "stock";
  age_restricted?: boolean;
  restricted?: string[];
  cross_ref?: string[];
  size_classes?: Record<string, string>;
  // size leaves
  size_class?: string | string[];
  container?: string;
  volume_ml?: number;
  unit_count?: number;
  // assortment slots
  target_count?: { min: number; max: number };
  mix?: Mix[];
  brand_hints?: string[];
}

/** A resolved taxonomy node: full id computed, sizes expanded. */
export interface TaxonomyNode {
  id: string;
  key: string;
  name: string;
  kind: Kind;
  note?: string;
  attrs: NodeAttrs;
  parentId: string | null;
  children: TaxonomyNode[];
  file: string;
}

export interface Taxonomy {
  roots: TaxonomyNode[];
  byId: Map<string, TaxonomyNode>;
}

export type Level = "error" | "warning";

export interface Issue {
  level: Level;
  file: string;
  /** Node id, store-type key, or CSV line the issue is about. */
  where?: string;
  message: string;
}

export const MATCH_STATUSES = ["auto", "approved", "rejected"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_SOURCES = ["rule", "llm", "manual"] as const;
export type MatchSource = (typeof MATCH_SOURCES)[number];

export interface MatchRow {
  node_id: string;
  mercaso_sku: string;
  case_pack?: number;
  rank?: number;
  confidence?: number;
  status: MatchStatus;
  source: MatchSource;
  reviewer?: string;
  note?: string;
}

/** Branded leaves are `matched` or `gap`; assortment slots are `covered`, `partial` or `gap`. */
export type CoverageStatus = "matched" | "covered" | "partial" | "gap";

export interface LeafMatch {
  status: CoverageStatus;
  approved: number;
  pending: number;
  rejected: number;
  skus: { sku: string; status: MatchStatus; rank?: number; case_pack?: number }[];
}
