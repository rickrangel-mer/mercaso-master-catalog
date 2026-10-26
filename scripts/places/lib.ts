// Matching a Google Places scrape to Mercaso's customers and the prospect list: pure logic for
// `pnpm places` (docs/exploration/places.md).

/** Words that say nothing about which store it is. */
const FILLER = new Set(["inc", "llc", "corp", "co", "the", "and", "of", "dba", "ltd", "store", "stores", "shop", "#", "no"]);

/** Lowercase name words without punctuation, numbers after "#", or filler. */
export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/#\s*\d+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w));
}

const bigrams = (s: string) => {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const b = s.slice(i, i + 2);
    out.set(b, (out.get(b) ?? 0) + 1);
  }
  return out;
};

/** Name similarity from 0 to 1: Dice coefficient on letter pairs of the cleaned names. */
export function nameSimilarity(a: string, b: string): number {
  const x = bigrams(nameWords(a).join(" "));
  const y = bigrams(nameWords(b).join(" "));
  let shared = 0;
  let total = 0;
  for (const [k, n] of x) shared += Math.min(n, y.get(k) ?? 0);
  for (const n of x.values()) total += n;
  for (const n of y.values()) total += n;
  return total ? (2 * shared) / total : 0;
}

/** Distance in meters between two points. */
export function meters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** The street number an address starts with, or "". */
export const streetNumber = (address: string) => address.trim().match(/^(\d+)/)?.[1] ?? "";

export interface Place {
  id: string;
  name: string;
  address: string;
  zip: string;
  lat: number;
  lng: number;
}

export interface Store {
  id: string;
  name: string;
  address: string;
  zip: string;
  lat: number;
  lng: number;
  placeId: string;
}

export type Method = "place id" | "nearby + name" | "address + name";

/**
 * How well a store and a place match, or null: the same place id; within 20 m with a name at least
 * 0.2 similar (a short form of the same name at the same spot), within 75 m and 0.35, or within 200 m
 * and 0.6; or the same street number and ZIP with a name at least 0.3 similar. The score orders the
 * candidates (place id first). Mercaso's own place ids point to the building, not the business, so
 * in practice location and name do the matching. A match with a name under 0.5 is worth a look.
 */
export function matchScore(s: Store, p: Place): { method: Method; score: number; sim: number } | null {
  const sim = nameSimilarity(s.name, p.name);
  if (s.placeId && s.placeId === p.id) return { method: "place id", score: 10, sim };
  const d = s.lat && p.lat ? meters(s.lat, s.lng, p.lat, p.lng) : Infinity;
  if ((d <= 20 && sim >= 0.2) || (d <= 75 && sim >= 0.35) || (d <= 200 && sim >= 0.6)) return { method: "nearby + name", score: 1 + sim - d / 1000, sim };
  const n = streetNumber(s.address);
  if (n && n === streetNumber(p.address) && s.zip === p.zip && sim >= 0.3) return { method: "address + name", score: 0.5 + sim, sim };
  return null;
}

/**
 * One-to-one matches between stores and places, best scores first. Places are looked up in a grid
 * of about 1 km cells around each store, plus the store's own place id.
 */
export function matchStores(stores: Store[], places: Place[]): Map<string, { place: string; method: Method; sim: number }> {
  const cell = (lat: number, lng: number) => `${Math.floor(lat * 100)}|${Math.floor(lng * 100)}`;
  const grid = new Map<string, Place[]>();
  const byId = new Map(places.map((p) => [p.id, p]));
  for (const p of places) {
    const k = cell(p.lat, p.lng);
    const list = grid.get(k) ?? [];
    list.push(p);
    grid.set(k, list);
  }
  const byZipNumber = new Map<string, Place[]>();
  for (const p of places) {
    const k = `${p.zip}|${streetNumber(p.address)}`;
    const list = byZipNumber.get(k) ?? [];
    list.push(p);
    byZipNumber.set(k, list);
  }
  const pairs: { s: string; p: string; method: Method; score: number; sim: number }[] = [];
  for (const s of stores) {
    const near = new Set<Place>();
    const own = byId.get(s.placeId);
    if (own) near.add(own);
    if (s.lat) {
      const la = Math.floor(s.lat * 100);
      const ln = Math.floor(s.lng * 100);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const p of grid.get(`${la + a}|${ln + b}`) ?? []) near.add(p);
    }
    for (const p of byZipNumber.get(`${s.zip}|${streetNumber(s.address)}`) ?? []) near.add(p);
    for (const p of near) {
      const m = matchScore(s, p);
      if (m) pairs.push({ s: s.id, p: p.id, ...m });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const out = new Map<string, { place: string; method: Method; sim: number }>();
  const taken = new Set<string>();
  for (const x of pairs) {
    if (out.has(x.s) || taken.has(x.p)) continue;
    out.set(x.s, { place: x.p, method: x.method, sim: x.sim });
    taken.add(x.p);
  }
  return out;
}

/** A prospect (name and ZIP only) to the place in its ZIP with the most similar name, at least `min`. */
export function matchByName(name: string, zip: string, placesInZip: Place[], min = 0.6): Place | null {
  let best: Place | null = null;
  let score = min;
  for (const p of placesInZip) {
    const s = nameSimilarity(name, p.name);
    if (s >= score) [best, score] = [p, s];
  }
  return best;
}
