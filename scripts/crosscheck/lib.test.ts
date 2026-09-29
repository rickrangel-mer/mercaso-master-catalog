import { describe, expect, it } from "vitest";
import { brandHits, matchRows, score, titleVolumeMl, tokens, type LeafTarget, type SalesRow } from "./lib.ts";

const row = (title: string, brand_name: string, department = "Beverage"): SalesRow => ({
  sku: title,
  title,
  brand_name,
  department,
  category: "",
  sub_category: "",
  package_size: 1,
  cases: 1,
  units: 1,
  orders: 1,
  stores_buying: 1,
  store_share: 0.1,
});

const leaf = (id: string, brand: string, variant: string, siblings: string[], volumeMl?: number): LeafTarget => ({
  id,
  department: "scd",
  kind: "size",
  path: id,
  brandOptions: [tokens(brand)],
  variant: tokens(variant).filter((t) => t !== "original" && !tokens(brand).includes(t)),
  siblingVariants: siblings.map((s) => tokens(s).filter((t) => !tokens(brand).includes(t))),
  slotWords: [],
  ...(volumeMl ? { volumeMl } : {}),
});

describe("tokens", () => {
  it("drops accents, apostrophes and plurals, and joins counts to units", () => {
    expect(tokens("Lay's Flamin' Hots")).toEqual(["lay", "flamin", "hot"]);
    expect(tokens("Tajín Clásico")).toEqual(["tajin", "clasico"]);
    expect(tokens("Zyn, Smooth, 6 mg")).toEqual(["zyn", "smooth", "6mg"]);
  });
});

describe("titleVolumeMl", () => {
  it("reads the last size in a title", () => {
    expect(titleVolumeMl("Coca-Cola, Soda, Classic, 2 L (8 Pack)")).toBe(2000);
    expect(titleVolumeMl("Coca-Cola, Soda, Mexican, 500 ml (24 Pack)")).toBe(500);
    expect(titleVolumeMl("Red Bull, Energy Drink, 8.4 oz (24 Pack)")).toBeCloseTo(248.4, 1);
    expect(titleVolumeMl("Marlboro, King Box Gold (10 Pack)")).toBeUndefined();
  });
});

describe("brandHits", () => {
  it("matches a brand line filed under a shorter brand or with different spacing", () => {
    expect(brandHits(tokens("Mott's Clamato"), new Set(tokens("Clamato Tomato Cocktail")), tokens("Clamato"))).toBe(1);
    expect(brandHits(tokens("7UP"), new Set(tokens("7 Up Soda")), tokens("7 Up"))).toBe(1);
    expect(brandHits(tokens("Pepsi"), new Set(tokens("Coca-Cola Soda")), tokens("Coca-Cola"))).toBe(0);
  });
});

describe("matching", () => {
  const pepsi = [
    leaf("pepsi.original.2l", "Pepsi", "Original", ["Diet Pepsi", "Zero Sugar"], 2000),
    leaf("pepsi.diet.2l", "Pepsi", "Diet Pepsi", ["Original", "Zero Sugar"], 2000),
    leaf("pepsi.original.20oz", "Pepsi", "Original", ["Diet Pepsi", "Zero Sugar"], 591),
  ];

  it("gives the plain SKU to the generic variant, not one whose name repeats the brand", () => {
    const hits = matchRows(pepsi, [row("Pepsi, Soda, 2 L (8 Pack)", "Pepsi")]);
    expect([...hits.keys()]).toEqual(["pepsi.original.2l"]);
  });

  it("gives a named variant its SKU and keeps sizes apart", () => {
    const hits = matchRows(pepsi, [row("Pepsi, Diet, 2 L (8 Pack)", "Pepsi"), row("Pepsi, Original, 20 oz (24 Pack)", "Pepsi")]);
    expect(hits.get("pepsi.diet.2l")?.map((r) => r.title)).toEqual(["Pepsi, Diet, 2 L (8 Pack)"]);
    expect(hits.get("pepsi.original.20oz")?.map((r) => r.title)).toEqual(["Pepsi, Original, 20 oz (24 Pack)"]);
  });

  it("stays inside the department's Mercaso scope", () => {
    const r = row("Pepsi, Soda, 2 L (8 Pack)", "Pepsi", "Candy & Snacks");
    expect(score(pepsi[0]!, r, new Set(tokens(r.title)), 2000)).toBe(0);
  });
});
