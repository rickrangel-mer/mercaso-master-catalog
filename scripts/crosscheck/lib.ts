// Pure helpers for the Phase 2.5 sales cross-check: text normalization, size parsing, and a
// rule-based matcher from Mercaso sales rows to catalog leaves. It is deliberately rough: good
// enough to rank and flag nodes for a human decision, not the Phase 4 matcher.
import type { OutputNode } from "../lib/output.ts";

export interface SalesRow {
  sku: string;
  title: string;
  brand_name: string;
  department: string;
  category: string;
  sub_category: string;
  package_size: number;
  cases: number;
  units: number;
  orders: number;
  stores_buying: number;
  store_share: number;
  /** Share over the last 90 days, against stores active in those 90 days. */
  store_share_90d: number;
  first_order_date: string;
  last_order_date: string;
  /** availability_status from the products export: ACTIVE, ARCHIVED or DRAFT; blank if unknown. */
  status: string;
}

/** Mercaso departments a catalog department may match into. Keeps "Takis" snacks out of seasonings. */
export const DEPARTMENT_SCOPE: Record<string, string[]> = {
  scd: ["Beverage"],
  drinks: ["Beverage", "Grocery"],
  "candy-snacks": ["Candy & Snacks"],
  tobacco: ["Tobacco", "Household & Kitchen", "Auto & Electronics", "Party & Gift Supplies"],
  "mixers-bar": ["Beverage", "Grocery", "Restaurants & Bars", "Store Supplies", "Household & Kitchen", "Party & Gift Supplies", "Cleaning & Laundry"],
  household: ["Household & Kitchen", "Cleaning & Laundry", "Restaurants & Bars", "Stationery & School Supplies", "Auto & Electronics", "Party & Gift Supplies", "Store Supplies"],
  "health-beauty": ["Health & Beauty", "Baby", "Beverage"],
  grocery: ["Grocery", "Pet", "Candy & Snacks"],
};

/** Variant names that mean "the plain one"; they match SKUs that name no sibling variant. */
const GENERIC = new Set(["original", "classic", "regular"]);

/**
 * Lowercase tokens with accents, apostrophes and plural "s" removed, and counts joined to their
 * unit: "Lay's Flamin' Hots" -> [lay, flamin, hot]; "Zyn 6 mg" -> [zyn, 6mg].
 */
export function tokens(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/(\d)\s+(mg|ct)\b/g, "$1$2")
    .split(/[^a-z0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean)
    .map((t) => (t.length > 4 && t.endsWith("ies") ? `${t.slice(0, -3)}y` : t))
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t))
    // "Berries", "Berry", "Twinkies" and "Twinkie" all end in "y" so singular and plural agree.
    .map((t) => (t.length > 4 && t.endsWith("ie") ? `${t.slice(0, -2)}y` : t));
}

const UNIT_ML: Record<string, number> = { oz: 29.5735, floz: 29.5735, ml: 1, l: 1000, liter: 1000, litre: 1000, gal: 3785.41, gallon: 3785.41 };

/** Liquid volume named in a title, in ml: "Coca-Cola, Soda, Classic, 2 L (8 Pack)" -> 2000. Last size wins. */
export function titleVolumeMl(title: string): number | undefined {
  const re = /(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|ml|liters?|litres?|l|gallons?|gal)\b/gi;
  let ml: number | undefined;
  for (const m of title.matchAll(re)) {
    const unit = m[2]!.toLowerCase().replace(/[\s.]/g, "").replace(/s$/, "");
    const factor = UNIT_ML[unit];
    if (factor) ml = Number(m[1]) * factor;
  }
  return ml;
}

export interface LeafTarget {
  id: string;
  department: string;
  kind: "size" | "assortment_slot";
  path: string;
  priority?: string;
  verify?: string;
  /** Tokens that must all appear: the brand line's name, or one brand hint for a slot. */
  brandOptions: string[][];
  /** Variant tokens; empty for a generic variant or a slot. */
  variant: string[];
  /** Distinguishing tokens of sibling variants; a generic variant must not contain them. */
  siblingVariants: string[][];
  /** Slot name tokens; a slot needs one of them in the SKU's text. */
  slotWords: string[];
  volumeMl?: number;
  /** The size leaf's display name, e.g. "King size" or "2.5–3.25oz bag". */
  sizeName?: string;
  /** Names of all size leaves under the same variant, e.g. ["Single", "King size"]. */
  variantSizes?: string[];
  /** Slot sizing and optional title phrases (`match_terms`). */
  target?: { min: number; max: number };
  matchTerms?: string[];
}

/** Flattens the built tree into matchable leaves. */
export function leafTargets(departments: OutputNode[]): LeafTarget[] {
  const out: LeafTarget[] = [];
  const walk = (node: OutputNode, dept: string, path: string[], line?: OutputNode, variant?: OutputNode, parent?: OutputNode) => {
    const here = [...path, node.name];
    if (node.kind === "size" && line && variant) {
      const brand = tokens(line.name);
      const siblings = (line.children ?? []).filter((v) => v !== variant).map((v) => distinct(v.name, brand));
      out.push({
        id: node.id,
        department: dept,
        kind: "size",
        path: here.join(" > "),
        priority: node.priority,
        verify: findVerify([line, variant, node]),
        brandOptions: [brand],
        // A brand line's only variant is its plain product, whatever the titles call it.
        variant: (line.children ?? []).length === 1 ? [] : distinct(variant.name, brand),
        siblingVariants: siblings.filter((s) => s.length > 0),
        slotWords: [],
        volumeMl: node.attrs.volume_ml,
        sizeName: node.name,
        variantSizes: (variant.children ?? []).map((c) => c.name),
      });
    } else if (node.kind === "assortment_slot") {
      const hints = node.attrs.brand_hints ?? [];
      out.push({
        id: node.id,
        department: dept,
        kind: "assortment_slot",
        path: here.join(" > "),
        priority: node.priority,
        verify: findVerify([node]),
        brandOptions: hints.map(tokens),
        variant: [],
        siblingVariants: [],
        slotWords: [...tokens(node.name), ...(parent ? tokens(parent.name) : [])].filter((t) => t.length >= 4),
        ...(node.attrs.target_count ? { target: node.attrs.target_count } : {}),
        ...(node.attrs.match_terms ? { matchTerms: node.attrs.match_terms } : {}),
      });
    }
    for (const child of node.children ?? []) {
      walk(child, dept, here, node.kind === "brand_line" ? node : line, node.kind === "variant" ? node : variant, node);
    }
  };
  for (const d of departments) walk(d, d.key, []);
  return out;
}

function findVerify(nodes: OutputNode[]): string | undefined {
  for (const n of nodes) if (n.attrs.verify) return n.attrs.verify;
  return undefined;
}

/** Variant tokens that say something the brand does not: "Diet Pepsi" under Pepsi -> [diet]. */
function distinct(name: string, brand: string[]): string[] {
  return tokens(name).filter((t) => !GENERIC.has(t) && !brand.includes(t));
}

/** A token matches itself, or a longer word it starts: "tamarind" matches "tamarindo". */
export function has(text: Set<string>, t: string): boolean {
  if (text.has(t)) return true;
  if (t.length < 5) return false;
  for (const w of text) if (w.startsWith(t)) return true;
  return false;
}

/**
 * Brand tokens found for one option, or 0. All the option's tokens must appear, unless the SKU's
 * own brand is a subset of them (Mercaso files Mott's Clamato under "Clamato") or the same words
 * without spaces.
 */
export function brandHits(option: string[], text: Set<string>, skuBrand: string[]): number {
  if (option.length === 0) return 0;
  if (option.every((t) => text.has(t))) return option.length;
  // "7UP" and "7 Up" differ only in spacing.
  if (skuBrand.length > 0 && option.join("") === skuBrand.join("")) return option.length;
  if (skuBrand.length > 0 && skuBrand.every((t) => option.includes(t))) return skuBrand.length;
  return 0;
}

/**
 * Scores a SKU against a leaf, or returns 0 for no match. Brand tokens must all appear; for a named
 * variant at least half its tokens must; a generic variant must not name a sibling variant; a
 * leaf with a volume must agree within 5% when the title states one. Higher is more specific.
 */
export function score(target: LeafTarget, row: SalesRow, text: Set<string>, volumeMl: number | undefined): number {
  if (!DEPARTMENT_SCOPE[target.department]?.includes(row.department)) return 0;
  const skuBrand = tokens(row.brand_name);
  const brand = Math.max(0, ...target.brandOptions.map((b) => brandHits(b, text, skuBrand)));
  if (brand === 0) return 0;
  let s = brand * 2;
  if (target.kind === "assortment_slot") {
    const hits = target.slotWords.filter((t) => has(text, t)).length;
    if (hits === 0) return 0;
    return s + hits;
  }
  if (target.variant.length > 0) {
    const hits = target.variant.filter((t) => has(text, t)).length;
    if (hits * 2 < target.variant.length || hits === 0) return 0;
    s += hits * 2 - (target.variant.length - hits);
  } else if (target.siblingVariants.some((v) => v.every((t) => has(text, t)))) {
    return 0;
  }
  if (target.volumeMl && volumeMl) {
    if (Math.abs(volumeMl - target.volumeMl) / target.volumeMl > 0.05) return 0;
    s += 1;
  }
  return s;
}

/** Assigns each SKU to its best-scoring leaves (ties kept). Returns leaf id -> rows. */
export function matchRows(targets: LeafTarget[], rows: SalesRow[]): Map<string, SalesRow[]> {
  const byLeaf = new Map<string, SalesRow[]>();
  for (const row of rows) {
    const text = new Set(tokens(`${row.brand_name} ${row.title}`));
    const volumeMl = titleVolumeMl(row.title);
    let best = 0;
    let winners: LeafTarget[] = [];
    for (const t of targets) {
      const s = score(t, row, text, volumeMl);
      if (s > best) [best, winners] = [s, [t]];
      else if (s === best && s > 0) winners.push(t);
    }
    for (const w of winners) {
      const list = byLeaf.get(w.id) ?? [];
      list.push(row);
      byLeaf.set(w.id, list);
    }
  }
  return byLeaf;
}
