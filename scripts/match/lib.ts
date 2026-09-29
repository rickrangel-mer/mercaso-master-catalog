// Phase 4 matcher: proposes Mercaso SKUs for every carried leaf. Rule-based and deterministic.
// Branded leaves need the brand line, the variant and (where the leaf states one) the size.
// Assortment slots need one of their match terms (or name words) and rank hinted brands first.
// Every candidate is ranked by how many liquor stores bought it, so the first row is the one
// stores already buy. Rows come out as status `auto`; a person approves them.
import { brandHits, DEPARTMENT_SCOPE, has, tokens, type LeafTarget } from "../crosscheck/lib.ts";

export interface Product {
  sku: string;
  title: string;
  brand_name: string;
  department: string;
  category: string;
  sub_category: string;
  package_size: number;
  item_size?: number;
  item_size_unit?: string;
  /** 12-month and 90-day store share from the sales export; 0 when never bought. */
  store_share: number;
  store_share_90d: number;
}

export interface Candidate {
  product: Product;
  score: number;
  confidence: number;
  /** False when a generic variant ("Original") matched a title naming some other flavor. */
  clean: boolean;
}

/** Product-type and packaging words that say nothing about flavor. */
const FILLER = new Set([
  "soda", "drink", "energy", "water", "juice", "sparkling", "mineral", "spring", "natural", "artesian", "alkaline", "ionized",
  "vapor", "distilled", "purified", "drinking", "can", "canned", "bottle", "glass", "pack", "two", "case", "of", "potato", "chip",
  "cracker", "cookie", "cooky", "sandwich", "candy", "bar", "gum", "mint", "cigarette", "cigar", "cigarillo", "lighter", "pouch", "tobacco",
  "oz", "ml", "l", "ct", "count", "gal", "lb", "fl", "size", "king", "box", "single", "share", "sharing", "the", "and", "with", "in",
  "jumbo", "bag", "peg", "tray", "big", "mini", "pre", "priced", "non", "nectar", "tomato", "cocktail", "original", "classic",
  "regular", "cola", "soft", "chewy", "hard", "stick", "filter", "filtered", "sweet", "sweets", "snack", "snacks", "seed", "sunflower",
  "milk", "chocolate", "maison", "ultimate", "wafer", "caramel", "peanut", "butter",
]);

/** Is the title free of words beyond the brand and filler? Only asked of generic variants. */
export function genericClean(t: LeafTarget, p: Product, text: Set<string>): boolean {
  if (t.kind !== "size" || t.variant.length > 0 || t.siblingVariants.length === 0) return true;
  const brand = new Set([...t.brandOptions.flat(), ...tokens(p.brand_name)]);
  if (text.has("original") || text.has("classic") || text.has("regular")) return true;
  return [...text].every((w) => brand.has(w) || FILLER.has(w) || /^\d/.test(w) || w.length <= 1);
}

const OZ_PER: Record<string, number> = { oz: 1, g: 1 / 28.3495, kg: 35.274, lb: 16, ml: 1 / 29.5735, l: 33.814, qt: 32, gal: 128 };

/** The item's size in ounces (weight or fluid), from the structured size or else the title. */
export function productOz(p: Product): number | undefined {
  const unit = p.item_size_unit?.toLowerCase();
  if (p.item_size && unit && OZ_PER[unit]) return p.item_size * OZ_PER[unit];
  let oz: number | undefined;
  for (const m of p.title.matchAll(/(\d+(?:\.\d+)?)\s*(oz|g|kg|lb|ml|l|qt|gal)\b/gi)) {
    const f = OZ_PER[m[2]!.toLowerCase()];
    if (f) oz = Number(m[1]) * f;
  }
  return oz;
}

const KING = /\b(king|share|sharing|big|xl|giant|family)\b/i;

/**
 * Does the product fit the leaf's stated size? true = fits, false = conflicts, undefined = the
 * leaf states nothing checkable. Volume leaves compare ml within 5%; "2.5–3.25oz"-style names
 * compare ounces within 8%; counts ("15-stick", "14ct") need the count in the title.
 */
export function sizeFits(t: LeafTarget, p: Product): boolean | undefined {
  const oz = productOz(p);
  if (t.volumeMl) return oz === undefined ? undefined : Math.abs(oz * 29.5735 - t.volumeMl) / t.volumeMl <= 0.05;
  const name = (t.sizeName ?? "").toLowerCase();
  if (!name) return undefined;
  if (/\bxvl\b/.test(name)) return /\bxvl\b/i.test(p.title);
  const range = name.match(/(\d+(?:\.\d+)?)\s*(?:[–-]\s*(\d+(?:\.\d+)?))?\s*oz/);
  if (range) {
    if (oz === undefined) return undefined;
    const lo = Number(range[1]);
    const hi = range[2] ? Number(range[2]) : lo;
    return oz >= lo * 0.92 && oz <= hi * 1.08;
  }
  const count = name.match(/(\d+)\s*[- ]?(piece|pc|stick|ct|count|pack)\b/);
  if (count) {
    const n = count[1];
    return new RegExp(`\\b${n}\\s*(ct|count|pc|pcs|piece|pieces|stick|sticks|pk)\\b|\\b${n}/\\$`, "i").test(p.title);
  }
  // Single versus king only means something when the variant comes in both.
  const pairedWithKing = (t.variantSizes ?? []).some((n) => /\bking\b/i.test(n));
  if (/\bking\b/.test(name)) return KING.test(p.title);
  if (/^single$/.test(name) && pairedWithKing) return !KING.test(p.title);
  if (/\bpeg\b/.test(name)) return /\bpeg\b/i.test(p.title) || (oz !== undefined && oz >= 3 && oz <= 9);
  return undefined;
}

/** A title without its case count: "Coca-Cola, Soda, Classic, 12 oz (35 Pack)" -> "coca-cola, soda, classic, 12 oz". */
export function productIdentity(title: string): string {
  return title.toLowerCase().replace(/\(\s*\d+\s*pack\s*\)/g, "").replace(/\s+/g, " ").trim();
}

/** Top candidate plus other case packs of the same product (rule 3), after any exclusions. */
export function keepCasePacks(list: Candidate[]): Candidate[] {
  if (list.length === 0) return list;
  const first = productIdentity(list[0]!.product.title);
  return list.filter((c, i) => i === 0 || productIdentity(c.product.title) === first);
}

function inScope(t: LeafTarget, p: Product): boolean {
  return DEPARTMENT_SCOPE[t.department]?.includes(p.department) ?? false;
}

/** Variant words a title may leave out: filler, not a different flavor. */
const SOFT = new Set(["sugar", "free", "flavor", "flavored", "original", "classic", "soda", "drink", "candy", "chip", "gum", "bar", "jerky", "powder", "sauce", "mix", "stick", "bag", "can", "bottle", "con", "de", "and", "with", "the", "chile", "chili", "mint", "pack", "size", "tea", "juice", "water", "style", "coke", "creme", "cream", "n", "sandwich", "mandarin"]);

/**
 * Brand points: a full brand-line match beats a product filed under a shorter brand, and a
 * product from an unrelated brand that only mentions the line ("Fiesta, Sour Patch Chamoy Kids")
 * scores lower still.
 */
function brandPoints(option: string[], text: Set<string>, skuBrand: string[]): number {
  const hits = brandHits(option, text, skuBrand);
  if (hits === 0) return 0;
  const points = option.every((w) => text.has(w)) ? hits * 2 : hits * 1.5;
  const related = skuBrand.length === 0 || skuBrand.some((w) => option.includes(w));
  return related ? points : points * 0.5;
}

/** Variant word points: 2 for the exact word, 1.5 for a longer word it starts ("tamarind" in "tamarindo"). */
function wordPoints(text: Set<string>, w: string): number {
  if (text.has(w)) return 2;
  return has(text, w) ? 1.5 : 0;
}

/** Score a product against a branded size leaf; 0 means no match. */
export function brandedScore(t: LeafTarget, p: Product, text: Set<string>, skuBrand: string[]): number {
  if (!inScope(t, p)) return 0;
  let s = Math.max(0, ...t.brandOptions.map((b) => brandPoints(b, text, skuBrand)));
  let variant = t.variant;
  // Umbrella lines (Frito-Lay) name the real brand in the variant: "Doritos Nacho Cheese".
  if (s === 0 && skuBrand.length > 0 && skuBrand.every((w) => variant.includes(w))) {
    s = skuBrand.length * 2;
    variant = variant.filter((w) => !skuBrand.includes(w));
  }
  if (s === 0) return 0;
  const joined = [...text].join("");
  if (variant.length > 0) {
    // "Gold Bears" also matches "Goldbears".
    const whole = variant.join("");
    const points = variant.map((w) => wordPoints(text, w));
    const hits = points.filter((x) => x > 0).length;
    if (whole.length >= 6 && joined.includes(whole) && hits < variant.length) {
      s += variant.length * 1.5;
    } else {
      // The first word leads ("Doritos Flamas" must not match "Fritos Turbos Flamas"), and every
      // other word must appear unless it is filler ("Zero Sugar" matches "Zero Soda").
      if (hits === 0 || points[0] === 0) return 0;
      if (variant.some((w, i) => points[i] === 0 && !SOFT.has(w) && !/^\d/.test(w))) return 0;
      s += points.reduce((a, b) => a + b, 0) - (variant.length - hits);
    }
  } else if (t.siblingVariants.some((v) => v.every((w) => has(text, w)))) {
    return 0;
  }
  const fits = sizeFits(t, p);
  if (fits === false) return 0;
  if (fits === true) s += 2;
  return s;
}

/** Words too generic to identify a slot on their own. */
const GENERIC = new Set(["value", "small", "large", "regular", "single", "pack", "bottle", "top", "flavor", "other", "one", "and", "the", "for", "with", "brand", "line", "item", "size"]);

/** Default slot terms: the slot's own name words (not its parent's), minus generic ones. */
export function defaultSlotTerms(t: LeafTarget): string[] {
  const name = t.path.split(" > ").pop() ?? "";
  return tokens(name).filter((w) => w.length >= 2 && !GENERIC.has(w) && !/^\d/.test(w));
}

/** Score a product against an assortment slot; 0 means no match. */
export function slotScore(t: LeafTarget, p: Product, text: Set<string>, skuBrand: string[]): number {
  if (!inScope(t, p)) return 0;
  const title = ` ${p.title.toLowerCase()} `;
  const termHit = t.matchTerms
    ? t.matchTerms.some((m) => title.includes(m.toLowerCase()))
    : defaultSlotTerms(t).some((w) => has(text, w));
  if (!termHit) return 0;
  const hinted = t.brandOptions.some((b) => brandHits(b, text, skuBrand) > 0);
  return 2 + (hinted ? 3 : 0);
}

function confidenceOf(t: LeafTarget, p: Product, fits: boolean | undefined, hinted: boolean): number {
  let c: number;
  if (t.kind === "size") c = 0.5 + (fits === true ? 0.2 : 0) + (t.volumeMl || fits !== undefined ? 0.05 : 0);
  else c = 0.4 + (hinted ? 0.25 : 0);
  if (p.store_share >= 0.005) c += 0.1;
  if (p.store_share >= 0.05) c += 0.1;
  return Math.min(0.95, Math.round(c * 100) / 100);
}

/**
 * Candidates per leaf. Each branded product goes to its best-scoring leaves only (ties kept, so a
 * cigarette carton SKU can serve the pack and carton leaves); slot candidates are independent.
 * A branded leaf ranks by 12-month store share (then 90-day share); `keepCasePacks` then trims it
 * to the top seller plus other case packs of that product (rule 3). A slot ranks suggested brands
 * first, then sales.
 */
export function matchCatalog(targets: LeafTarget[], products: Product[]): Map<string, Candidate[]> {
  const out = new Map<string, Candidate[]>();
  const push = (id: string, c: Candidate) => {
    const list = out.get(id) ?? [];
    list.push(c);
    out.set(id, list);
  };
  const sizes = targets.filter((t) => t.kind === "size");
  const slots = targets.filter((t) => t.kind === "assortment_slot");
  for (const p of products) {
    const text = new Set(tokens(`${p.brand_name} ${p.title}`));
    const skuBrand = tokens(p.brand_name);
    let best = 0;
    let winners: LeafTarget[] = [];
    for (const t of sizes) {
      const s = brandedScore(t, p, text, skuBrand);
      if (s > best) [best, winners] = [s, [t]];
      else if (s === best && s > 0) winners.push(t);
    }
    for (const t of winners) {
      const clean = genericClean(t, p, text);
      const confidence = confidenceOf(t, p, sizeFits(t, p), true);
      push(t.id, { product: p, score: best, confidence: clean ? confidence : Math.min(confidence, 0.55), clean });
    }
    for (const t of slots) {
      const s = slotScore(t, p, text, skuBrand);
      if (s > 0) push(t.id, { product: p, score: s, confidence: confidenceOf(t, p, undefined, s >= 5), clean: true });
    }
  }
  const isSize = new Set(sizes.map((t) => t.id));
  for (const [id, list] of out) {
    list.sort(
      (a, b) =>
        Number(b.clean) - Number(a.clean) ||
        b.product.store_share - a.product.store_share ||
        b.product.store_share_90d - a.product.store_share_90d ||
        b.score - a.score,
    );
    if (isSize.has(id)) {
      out.set(id, list);
    } else {
      // Slots: suggested brands first (score 5 vs 2), each group by sales.
      list.sort((a, b) => b.score - a.score || b.product.store_share - a.product.store_share || b.product.store_share_90d - a.product.store_share_90d);
      out.set(id, list);
    }
  }
  return out;
}
