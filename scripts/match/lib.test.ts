import { describe, expect, it } from "vitest";
import { tokens, type LeafTarget } from "../crosscheck/lib.ts";
import { keepCasePacks, matchCatalog, productIdentity, productOz, sizeFits, type Product } from "./lib.ts";

const product = (title: string, brand_name: string, department: string, extra: Partial<Product> = {}): Product => ({
  sku: title,
  title,
  brand_name,
  department,
  category: "",
  sub_category: "",
  package_size: 24,
  store_share: 0.1,
  store_share_90d: 0.1,
  ...extra,
});

const size = (id: string, dept: string, brand: string, variant: string, siblings: string[], sizeName: string, extra: Partial<LeafTarget> = {}): LeafTarget => {
  const b = tokens(brand);
  const strip = (s: string) => tokens(s).filter((t) => !["original", "classic", "regular"].includes(t) && !b.includes(t));
  return {
    id,
    department: dept,
    kind: "size",
    path: id,
    brandOptions: [b],
    variant: strip(variant),
    siblingVariants: siblings.map(strip).filter((s) => s.length > 0),
    slotWords: [],
    sizeName,
    ...extra,
  };
};

describe("sizes", () => {
  it("reads ounces from the structured size or the title", () => {
    expect(productOz(product("Takis, Fuego, 3.25 oz (20 Pack)", "Takis", "Candy & Snacks"))).toBeCloseTo(3.25);
    expect(productOz(product("X", "X", "Grocery", { item_size: 500, item_size_unit: "g" }))).toBeCloseTo(17.64, 1);
  });

  it("checks weight ranges, counts, XVL and single versus king", () => {
    const bag = size("t.bag", "candy-snacks", "Takis", "Fuego", [], "2.5–3.25oz bag");
    expect(sizeFits(bag, product("Takis, Fuego, 3.25 oz (20 Pack)", "Takis", "Candy & Snacks"))).toBe(true);
    expect(sizeFits(bag, product("Takis, Fuego, 9.9 oz (14 Pack)", "Takis", "Candy & Snacks"))).toBe(false);
    const gum = size("g", "candy-snacks", "Extra", "Spearmint", [], "15-stick pack");
    expect(sizeFits(gum, product("Extra, Spearmint, 15 ct (10 Pack)", "Extra", "Candy & Snacks"))).toBe(true);
    const single = size("s", "candy-snacks", "Slim Jim", "Giant", [], "Single", { variantSizes: ["Single"] });
    expect(sizeFits(single, product("Slim Jim, Giant Size, Original, 0.97 oz", "Slim Jim", "Candy & Snacks"))).toBeUndefined();
    const paired = size("k", "candy-snacks", "Snickers", "Original", [], "Single", { variantSizes: ["Single", "King size"] });
    expect(sizeFits(paired, product("Snickers, Share Size, 3.29 oz", "Snickers", "Candy & Snacks"))).toBe(false);
  });
});

describe("matching", () => {
  it("prefers the full brand line over a shorter brand and keeps other case packs of the top seller", () => {
    const targets = [
      size("coke.classic.12", "scd", "Coca-Cola", "Classic", ["Zero Sugar"], "12oz can", { volumeMl: 355 }),
      size("mex.classic.12", "scd", "Coca-Cola Mexican", "Classic", [], "12oz glass", { volumeMl: 355 }),
    ];
    const products = [
      product("Coca-Cola, Soda, Classic, 12 oz (35 Pack)", "Coca-Cola", "Beverage", { store_share: 0.3 }),
      product("Coca-Cola, Soda, Classic, 12 oz (24 Pack)", "Coca-Cola", "Beverage", { store_share: 0.26 }),
      product("Coca-Cola, Soda, Mexican, 355 ml (24 Pack)", "Coca-Cola", "Beverage", { store_share: 0.57 }),
    ];
    const out = matchCatalog(targets, products);
    expect(keepCasePacks(out.get("coke.classic.12") ?? []).map((c) => c.product.title)).toEqual([
      "Coca-Cola, Soda, Classic, 12 oz (35 Pack)",
      "Coca-Cola, Soda, Classic, 12 oz (24 Pack)",
    ]);
    expect(out.get("mex.classic.12")?.map((c) => c.product.title)).toEqual(["Coca-Cola, Soda, Mexican, 355 ml (24 Pack)"]);
  });

  it("needs the first variant word and every non-filler word", () => {
    const flamas = size("fl.doritos-flamas", "candy-snacks", "Frito-Lay", "Doritos Flamas", [], "2.5–3.25oz bag");
    const mexCola = size("j.mex-cola", "scd", "Jarritos", "Mexican Cola", ["Mango"], "12.5oz glass", { volumeMl: 370 });
    const out = matchCatalog(
      [flamas, mexCola],
      [
        product("Frito Lay, Fritos, Turbos Flamas, 3.5 oz", "Frito Lay", "Candy & Snacks"),
        product("Doritos, Flamas Chips, 2.5 oz (24 Pack)", "Doritos", "Candy & Snacks"),
        product("Jarritos, Mexican Soda, Mango, 370 ml (24 Pack)", "Jarritos", "Beverage"),
        product("Jarritos, Soda Mexican Cola, 370 ml (24 Pack)", "Jarritos", "Beverage"),
      ],
    );
    expect(out.get("fl.doritos-flamas")?.map((c) => c.product.title)).toEqual(["Doritos, Flamas Chips, 2.5 oz (24 Pack)"]);
    expect(out.get("j.mex-cola")?.map((c) => c.product.title)).toEqual(["Jarritos, Soda Mexican Cola, 370 ml (24 Pack)"]);
  });

  it("ranks a plain product above another flavor for a generic variant", () => {
    const original = size("p.original", "candy-snacks", "Pringles", "Original", ["Sour Cream & Onion"], "2.5oz can");
    const out = matchCatalog(
      [original],
      [
        product("Pringles, Potato Chips, Pizza, 2.5 oz", "Pringles", "Candy & Snacks", { store_share: 0.05 }),
        product("Pringles, Potato Chips, Original, 2.5 oz", "Pringles", "Candy & Snacks", { store_share: 0.01 }),
      ],
    );
    const list = out.get("p.original") ?? [];
    expect(list[0]?.product.title).toBe("Pringles, Potato Chips, Original, 2.5 oz");
    expect(list[1]?.clean).toBe(false);
    expect(list[1]?.confidence).toBeLessThanOrEqual(0.55);
  });

  it("strips the case count from a product identity", () => {
    expect(productIdentity("Coca-Cola, Soda, Classic, 12 oz (35 Pack)")).toBe("coca-cola, soda, classic, 12 oz");
  });
});
