/**
 * Board slides on growing the basket:
 *   1. Growing the Basket: the average order a year ago, today, in six months and in twelve, by
 *      department, in dollars per order and SKUs a store buys a year, with the change over the last
 *      twelve months and the next twelve.
 *   2. Where and How to Grow: where the room is (how often orders include each department, today,
 *      the 12-month plan and the top-quartile store) and, beside it, how to grow (to be filled in).
 *
 *   pnpm athena:export basket-mix basket-headroom basket-store-skus
 *   pnpm slides:basket            writes dist/slides/basket-progression.pptx
 *
 * The AOV path (today, Apr '27, Oct '27) is the plan's number, set below. Today's department mix
 * comes from basket_mix.csv (last six full months, all stores), scaled to the plan's starting AOV;
 * a year ago is the same six months a year earlier, as measured. The growth is split with a simple,
 * stated rule:
 *   - Cross-department lines (every department but Beverage and Tobacco) close a share of the gap
 *     between how often the typical order includes them and how often top-quartile stores' orders
 *     do, at today's ticket: headroom = (share_p75 - share_avg) * ticket (basket_headroom.csv).
 *     25% of that gap by Apr '27 and 50% by Oct '27.
 *   - Tobacco holds flat (it has been sliding and is not a growth lever).
 *   - Beverage fills the rest of the plan.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import pptxgenModule from "pptxgenjs";

// pptxgenjs is CommonJS: at runtime the default import is the class, but its types describe the module.
const pptxgen = pptxgenModule as unknown as typeof pptxgenModule.default;

const ROOT = process.cwd();
// Where-to-grow bars run on a 0-100% track of orders; --scale=best runs each to its own top-quartile store.
const SCALE_TO_BEST = process.argv.includes("--scale=best");
// Beside the dollars: the distinct SKUs a regular store buys in a year (basket_store_skus.csv, stores
// with 12+ orders in the year); --units=cases shows cases per order instead.
const SKUS = !process.argv.includes("--units=cases");
const UNIT = SKUS
  ? { short: "SKUs", long: "SKUs", header: "$ per order · SKUs per store / yr" }
  : { short: "cs", long: "cases", header: "$ per order · cases (cs)" };
const OUT = join(ROOT, `dist/slides/basket-progression${SKUS ? "" : "-cases"}${SCALE_TO_BEST ? "-best" : ""}.pptx`);

// The plan's AOV path. The year-ago column is measured, not planned.
const PLAN = [
  { key: "today", label: "TODAY", sub: "Oct '26", aov: 1059.4 },
  { key: "apr", label: "6 MONTHS", sub: "Apr '27", aov: 1112.07 },
  { key: "oct", label: "12 MONTHS", sub: "Oct '27", aov: 1219.57 },
] as const;
type PlanKey = (typeof PLAN)[number]["key"];
// Share of the top-quartile gap closed at each step.
const GAP_CLOSED = { today: 0, apr: 0.25, oct: 0.5 } as const;

const DEPARTMENTS = [
  "Beverage",
  "Candy & Snacks",
  "Tobacco",
  "Grocery",
  "Cleaning & Laundry",
  "Household & Kitchen",
  "Health & Beauty",
  "Other",
] as const;
type Dept = (typeof DEPARTMENTS)[number];
const LABEL: Record<Dept, string> = {
  Beverage: "Beverage",
  "Candy & Snacks": "Candy & Snacks",
  Tobacco: "Tobacco",
  Grocery: "Grocery",
  "Cleaning & Laundry": "Cleaning & Laundry",
  "Household & Kitchen": "Household & Kitchen",
  "Health & Beauty": "Health & Beauty",
  Other: "All other departments",
};

const csv = (name: string) =>
  parse(readFileSync(join(ROOT, "data/raw", name), "utf8"), { columns: true }) as Record<string, string>[];

// ---------- numbers ----------

type Basket = Record<Dept, number>;
const zero = (): Basket => Object.fromEntries(DEPARTMENTS.map((d) => [d, 0])) as Basket;
const sum = (b: Basket) => DEPARTMENTS.reduce((s, d) => s + b[d], 0);
const deptOf = (name: string | undefined): Dept =>
  (DEPARTMENTS as readonly string[]).includes(name ?? "") ? (name as Dept) : "Other";

/** Department mix for one period of basket_mix.csv. */
function mix(period: "current" | "prior") {
  const perOrder = zero();
  const casesPerOrder = zero();
  const eachesPerOrder = zero();
  for (const r of csv("basket_mix.csv").filter((r) => r.period === period)) {
    const d = deptOf(r.department);
    perOrder[d] += Number(r.per_order);
    casesPerOrder[d] += Number(r.cases_per_order);
    eachesPerOrder[d] += Number(r.units_per_order);
  }
  return { perOrder, casesPerOrder, eachesPerOrder };
}
const current = mix("current");
const prior = mix("prior");
const measuredAov = sum(current.perOrder);
const scale = PLAN[0].aov / measuredAov;
const priorAov = sum(prior.perOrder);

/** Distinct SKUs a regular store buys in a year, for one period of basket_store_skus.csv. */
function storeSkus(period: "current" | "prior") {
  const skus = zero();
  let stores = 0;
  for (const r of csv("basket_store_skus.csv").filter((r) => r.period === period)) {
    skus[deptOf(r.department)] += Number(r.avg_skus_regular);
    stores = Number(r.regular_stores);
  }
  return { skus, stores };
}
const skusNow = storeSkus("current");
const skusPrior = storeSkus("prior");

// Units beside the dollars: SKUs per store per year, or cases per order (today's scaled with the dollars).
// Eaches go in the notes only, since assortment items such as bags and cups count by the each.
const unitsToday = SKUS ? skusNow.skus : (Object.fromEntries(DEPARTMENTS.map((d) => [d, current.casesPerOrder[d] * scale])) as Basket);
const unitsPrior = SKUS ? skusPrior.skus : prior.casesPerOrder;

const head = Object.fromEntries(csv("basket_headroom.csv").map((r) => [r.department, r])) as Record<Dept, Record<string, string>>;
const headroom = Object.fromEntries(
  DEPARTMENTS.map((d) => {
    if (d === "Beverage" || d === "Tobacco") return [d, 0];
    const h = head[d];
    return [d, Math.max(0, Number(h.share_p75) - Number(h.share_avg)) * Number(h.ticket)];
  }),
) as Basket;
const totalHeadroom = sum(headroom);

const baskets = Object.fromEntries(
  PLAN.map((p) => {
    const b = {} as Basket;
    for (const d of DEPARTMENTS) b[d] = current.perOrder[d] * scale + GAP_CLOSED[p.key] * headroom[d];
    b.Beverage += p.aov - sum(b);
    return [p.key, b];
  }),
) as Record<PlanKey, Basket>;

/** Whole dollars that add up to the rounded total; Beverage absorbs the rounding. */
function rounded(b: Basket, total: number): Basket {
  const r = {} as Basket;
  for (const d of DEPARTMENTS) r[d] = Math.round(b[d]);
  r.Beverage += Math.round(total) - sum(r);
  return r;
}
const shown = Object.fromEntries(PLAN.map((p) => [p.key, rounded(baskets[p.key], p.aov)])) as Record<PlanKey, Basket>;
const shownPrior = rounded(prior.perOrder, priorAov);

const crossDepts = DEPARTMENTS.filter((d) => d !== "Beverage" && d !== "Tobacco");

// Share of orders that include each department, for the where-to-grow bars: today (order-weighted
// average), the 12-month plan (the same share of the gap the dollars close) and the top-quartile store.
const share = (d: Dept) => {
  const today = Number(head[d].share_avg);
  const top = Math.max(today, Number(head[d].share_p75));
  return { today, plan: today + GAP_CLOSED.oct * (top - today), top };
};
const crossToday = crossDepts.reduce((s, d) => s + shown.today[d], 0);
const crossOct = crossDepts.reduce((s, d) => s + shown.oct[d], 0);

// Units at each step grow with the department's dollars: cases at today's dollars per case, or SKUs
// per store at today's spend per SKU.
const units = (p: PlanKey, d: Dept) => unitsToday[d] * (baskets[p][d] / baskets.today[d]);
const totalUnits = (p: PlanKey) => DEPARTMENTS.reduce((s, d) => s + units(p, d), 0);
const roundUnits = (n: number) => (SKUS ? Math.round(n) : Math.round(n * 10) / 10);
const fmtUnits = (n: number) => (SKUS ? Math.round(n).toLocaleString("en-US") : n.toFixed(1));

// Last year in dollars, for the headline and notes.
const lastYearGrowth = Math.round(PLAN[0].aov) - Math.round(priorAov);
const bevLastYear = shown.today.Beverage - shownPrior.Beverage;

console.log(`Measured AOV ${measuredAov.toFixed(2)}, scaled by ${scale.toFixed(4)} to ${PLAN[0].aov}; a year ago ${priorAov.toFixed(2)}`);
console.log(`Top-quartile headroom ${totalHeadroom.toFixed(2)} per order`);
console.table(
  DEPARTMENTS.map((d) => ({
    department: d,
    yearAgo: shownPrior[d],
    today: shown.today[d],
    apr: shown.apr[d],
    oct: shown.oct[d],
    unitsYearAgo: fmtUnits(unitsPrior[d]),
    unitsToday: fmtUnits(units("today", d)),
    unitsApr: fmtUnits(units("apr", d)),
    unitsOct: fmtUnits(units("oct", d)),
  })),
);
console.log(
  `${UNIT.long} ${SKUS ? "per store per year" : "per order"}: ${fmtUnits(sum(unitsPrior))} / ` +
    `${PLAN.map((p) => fmtUnits(totalUnits(p.key))).join(" / ")}`,
);

// ---------- shared look ----------

const FONT = { black: "Circular Air Pro Black", bold: "Circular Air Pro Bold", book: "Circular Air Pro Book" };
const COLOR = {
  magenta: "ED008C",
  purple: "5C2E91",
  ink: "1D1B3A",
  muted: "6B6880",
  line: "E6E3EE",
  today: "F3F1F7",
  apr: "FCE3F0",
  blush: "FDEBF5",
  panel: "FBF8FD",
  white: "FFFFFF",
  today_bar: "2F6FDF",
  plan_bar: "F07E1A",
  head_bar: "D92D3F",
  track: "ECE8F2",
};
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const signedMoney = (n: number) => (n < 0 ? `−${money(-n)}` : `+${money(n)}`);
const signedUnits = (n: number) => (n < 0 ? `−${fmtUnits(-n)}` : n === 0 ? "0" : `+${fmtUnits(n)}`);
const pct = (n: number) => `${Math.round(n * 100)}%`;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5, same as the board deck
pres.title = "Growing the Basket";
pres.theme = { headFontFace: FONT.black, bodyFontFace: FONT.book };

const X0 = 0.69;
const X1 = 12.65;
type Slide = ReturnType<typeof pres.addSlide>;
type Runs = { text: string; options: Record<string, unknown> }[];

/** White slide with the deck's corner circle, a magenta title and a one-line subtitle. */
function addFrame(title: string, subtitle: Runs): Slide {
  const slide = pres.addSlide();
  slide.background = { color: COLOR.white };
  slide.addShape(pres.ShapeType.ellipse, {
    x: 10.6, y: -2.6, w: 4.6, h: 4.6, fill: { color: COLOR.blush }, line: { type: "none" }, objectName: "Corner circle",
  });
  slide.addText(title, {
    x: X0, y: 0.5, w: 9, h: 0.6, margin: 0, fontFace: FONT.black, fontSize: 32, color: COLOR.magenta, isTextBox: true,
    objectName: "Title",
  });
  slide.addText(subtitle, {
    x: X0, y: 1.15, w: X1 - X0, h: 0.45, margin: 0, fontSize: 18, color: COLOR.ink, isTextBox: true, objectName: "Subtitle",
  });
  return slide;
}

function addFootnote(slide: Slide, text: string, y: number) {
  slide.addText(text, {
    x: X0, y, w: X1 - X0, h: 7.4 - y, margin: 0, valign: "top", fontFace: FONT.book, fontSize: 10, color: COLOR.muted,
    isTextBox: true, objectName: "Footnote",
  });
}

// ---------- slide 1: growing the basket ----------

{
  const slide = addFrame("Growing the Basket", [
    { text: `Beverage drove ${pct(bevLastYear / lastYearGrowth)} of last year’s growth. `, options: { fontFace: FONT.book } },
    {
      text: `${pct((GAP_CLOSED.oct * totalHeadroom) / (PLAN[2].aov - PLAN[0].aov))} of the next ${money(PLAN[2].aov - PLAN[0].aov)} comes from the rest of the store.`,
      options: { fontFace: FONT.bold },
    },
  ]);

  const TOP = 1.95;
  const BOTTOM = 6.75;
  const HEADER_H = 1.3;
  const ROW_Y0 = TOP + HEADER_H + 0.12;
  const ROW_H = (BOTTOM - 0.1 - ROW_Y0) / DEPARTMENTS.length;
  const LABEL_W = 2.35;
  const CARD_W = 1.62;
  const GAP = 0.12;
  const cardX = (i: number) => X0 + LABEL_W + i * (CARD_W + GAP);
  const DELTA_W = 1.12;
  const DELTA_GAP = 0.12;
  const deltaX = (k: number) => X1 - (2 - k) * DELTA_W - (1 - k) * DELTA_GAP;

  for (let i = 1; i < DEPARTMENTS.length; i++) {
    slide.addShape(pres.ShapeType.line, {
      x: X0, y: ROW_Y0 + i * ROW_H, w: X1 - X0, h: 0, line: { color: COLOR.line, width: 0.75 }, objectName: `Row rule ${i}`,
    });
  }

  // Four cards: a year ago (measured), today, and the plan's two steps.
  const COLUMNS = [
    { label: "12 MONTHS AGO", sub: "Oct '25", aov: priorAov, dollars: shownPrior, unitsOf: (d: Dept) => unitsPrior[d], total: sum(unitsPrior), fill: COLOR.white, border: true },
    ...PLAN.map((p, i) => ({
      label: p.label, sub: p.sub, aov: p.aov, dollars: shown[p.key], unitsOf: (d: Dept) => units(p.key, d), total: totalUnits(p.key),
      fill: [COLOR.today, COLOR.apr, COLOR.magenta][i]!, border: false, step: p.key,
    })),
  ];
  COLUMNS.forEach((c, i) => {
    const x = cardX(i);
    const dark = i === 3;
    const fg = dark ? COLOR.white : COLOR.ink;
    const sub = dark ? "FFD6EC" : COLOR.muted;
    slide.addShape(pres.ShapeType.roundRect, {
      x, y: TOP, w: CARD_W, h: BOTTOM - TOP, rectRadius: 0.12, fill: { color: c.fill },
      line: c.border ? { color: COLOR.line, width: 1 } : { type: "none" }, objectName: `${c.sub} card`,
    });
    slide.addText(
      [
        { text: c.label, options: { fontFace: FONT.bold, fontSize: 10, charSpacing: 1, color: dark ? COLOR.white : i === 0 ? COLOR.muted : COLOR.magenta, breakLine: true } },
        { text: c.sub, options: { fontFace: FONT.book, fontSize: 11, color: sub } },
      ],
      { x, y: TOP + 0.14, w: CARD_W, h: 0.42, margin: 0, align: "center", valign: "top", isTextBox: true, objectName: `${c.sub} label` },
    );
    slide.addText(money(c.aov), {
      x, y: TOP + 0.56, w: CARD_W, h: 0.42, margin: 0, align: "center", valign: "middle", fontFace: FONT.black, fontSize: 24,
      color: fg, isTextBox: true, objectName: `${c.sub} AOV`,
    });
    const growth = c.aov - PLAN[0].aov;
    const pctGrowth = `+${Math.round((growth / PLAN[0].aov) * 100)}%`;
    const unitTotal = `${fmtUnits(c.total)} ${UNIT.short}`;
    const growthLine = i <= 1 ? (SKUS ? `${unitTotal} / yr` : "avg. order") : SKUS ? `${pctGrowth} · ${unitTotal}` : `+${money(growth)} · ${pctGrowth}`;
    slide.addText(growthLine, {
      x, y: TOP + 0.98, w: CARD_W, h: 0.24, margin: 0, align: "center", valign: "middle", fontFace: FONT.bold, fontSize: 11,
      color: dark ? COLOR.white : i === 2 ? COLOR.magenta : COLOR.muted, isTextBox: true, objectName: `${c.sub} growth`,
    });

    DEPARTMENTS.forEach((d, r) => {
      // Three aligned columns inside the card: dollars and unit count right-aligned, the unit word
      // left-aligned, all on one baseline (bottom-anchored boxes of the same height).
      const cellH = 0.25;
      const cell = { y: ROW_Y0 + r * ROW_H + (ROW_H - cellH) / 2, h: cellH, margin: 0, valign: "bottom" as const, isTextBox: true, wrap: false };
      slide.addText(money(c.dollars[d]), {
        ...cell, x: x + 0.06, w: 0.66, align: "right", fontFace: FONT.bold, fontSize: 14, color: fg, objectName: `${c.sub} ${d} $`,
      });
      slide.addText(fmtUnits(c.unitsOf(d)), {
        ...cell, x: x + 0.76, w: 0.32, align: "right", fontFace: FONT.book, fontSize: 10, color: sub, objectName: `${c.sub} ${d} count`,
      });
      slide.addText(UNIT.short, {
        ...cell, x: x + 1.11, w: 0.42, align: "left", fontFace: FONT.book, fontSize: 10, color: sub, objectName: `${c.sub} ${d} unit`,
      });
    });
  });

  slide.addText(
    [
      { text: "DEPARTMENT", options: { fontFace: FONT.bold, charSpacing: 1, breakLine: true } },
      { text: UNIT.header, options: { fontFace: FONT.book } },
    ],
    { x: X0, y: ROW_Y0 - 0.5, w: LABEL_W, h: 0.42, margin: 0, valign: "bottom", fontSize: 10, color: COLOR.muted, isTextBox: true,
      objectName: "Department header" },
  );

  // Two change columns: the last twelve months (measured) and the next twelve (the plan), each in
  // dollars and units, taken from the rounded figures shown in the cards so they match them.
  const CHANGES = [
    { title: "LAST 12 MO", sub: "since Oct '25", dollars: (d: Dept) => shown.today[d] - shownPrior[d], units: (d: Dept) => roundUnits(units("today", d)) - roundUnits(unitsPrior[d]), plan: false },
    { title: "NEXT 12 MO", sub: "to Oct '27", dollars: (d: Dept) => shown.oct[d] - shown.today[d], units: (d: Dept) => roundUnits(units("oct", d)) - roundUnits(units("today", d)), plan: true },
  ];
  CHANGES.forEach((ch, k) => {
    const x = deltaX(k);
    slide.addText(
      [
        { text: ch.title, options: { fontFace: FONT.bold, charSpacing: 1, breakLine: true } },
        { text: ch.sub, options: { fontFace: FONT.book } },
      ],
      { x, y: ROW_Y0 - 0.5, w: DELTA_W, h: 0.42, margin: 0, align: "right", valign: "bottom", fontSize: 10, color: COLOR.muted,
        isTextBox: true, objectName: `${ch.title} header` },
    );
    DEPARTMENTS.forEach((d, r) => {
      const dollars = ch.dollars(d);
      const cross = crossDepts.includes(d as (typeof crossDepts)[number]);
      const flat = ch.plan && dollars === 0;
      const color = flat ? COLOR.muted : ch.plan ? (cross ? COLOR.magenta : COLOR.ink) : COLOR.ink;
      slide.addText(
        [
          { text: flat ? "flat" : signedMoney(dollars), options: { fontFace: ch.plan ? FONT.black : FONT.bold, fontSize: 14, color, breakLine: true } },
          { text: flat ? " " : `${signedUnits(ch.units(d))} ${UNIT.short}`, options: { fontFace: FONT.book, fontSize: 9, color: COLOR.muted } },
        ],
        { x, y: ROW_Y0 + r * ROW_H, w: DELTA_W, h: ROW_H, margin: 0, align: "right", valign: "middle", lineSpacingMultiple: 0.82,
          isTextBox: true, objectName: `${ch.title} ${d}` },
      );
    });
  });

  DEPARTMENTS.forEach((d, r) => {
    const cross = crossDepts.includes(d as (typeof crossDepts)[number]);
    slide.addText(LABEL[d], {
      x: X0, y: ROW_Y0 + r * ROW_H, w: LABEL_W - 0.1, h: ROW_H, margin: 0, valign: "middle", fontFace: cross ? FONT.bold : FONT.book,
      fontSize: 14, color: COLOR.ink, isTextBox: true, objectName: `Label ${d}`,
    });
  });

  addFootnote(
    slide,
    `$ per order: all orders May–Oct 2026 (today, scaled to $${PLAN[0].aov.toLocaleString("en-US", { minimumFractionDigits: 2 })}) and May–Oct 2025 (12 months ago). ` +
      (SKUS
        ? `SKUs: distinct SKUs a store buys in a year, stores with 12+ orders (Nov '25–Oct '26: ${skusNow.stores.toLocaleString("en-US")} stores; ` +
          `Nov '24–Oct '25: ${skusPrior.stores.toLocaleString("en-US")}); Apr and Oct grow with each department's $. `
        : `Cases at today's $ per case. `) +
      `Plan: the rest of the store closes 25% of its gap to top-quartile stores by Apr '27 and 50% by Oct '27; Tobacco flat; Beverage fills the rest.`,
    6.86,
  );

  const bevOct = shown.oct.Beverage - shown.today.Beverage;
  slide.addNotes(
    [
      `A year ago our average order was ${money(priorAov)}. Today it is ${money(PLAN[0].aov)}, up ${money(lastYearGrowth)}, and Beverage was ` +
        `${money(bevLastYear)} of that. The plan takes the order to ${money(PLAN[1].aov)} by April and ${money(PLAN[2].aov)} by next October, about 15% higher.`,
      `Beverage is ${pct(shown.today.Beverage / Math.round(PLAN[0].aov))} of the order today and will keep doing a lot of the work: ` +
        `about +${money(bevOct)} in this plan, less than half of what it added last year. The rest of the store has to carry more: cross-department ` +
        `spend goes from ${money(crossToday)} to ${money(crossOct)} per order, with Candy & Snacks the biggest piece and Grocery and Cleaning next.`,
      SKUS
        ? `A regular store bought about ${fmtUnits(sum(unitsPrior))} different SKUs from us a year ago and ${fmtUnits(totalUnits("today"))} today; ` +
          `the plan takes that to about ${fmtUnits(totalUnits("apr"))} by April and ${fmtUnits(totalUnits("oct"))} by October. Last year almost all of the ` +
          `added breadth was Beverage and Candy & Snacks; Grocery, Cleaning, Household and Health & Beauty stayed flat. The plan asks for more breadth ` +
          `than last year delivered, so treat the SKU path as a target the catalog and recommendations have to earn.`
        : `In cases, the order goes from about ${Math.round(totalUnits("today"))} to ${Math.round(totalUnits("apr"))} to ${Math.round(totalUnits("oct"))} cases.`,
      `In eaches, today's order is about ${Math.round(sum(current.eachesPerOrder) * scale)} units ` +
        `(Beverage about ${Math.round(current.eachesPerOrder.Beverage * scale)}, Candy & Snacks about ${Math.round(current.eachesPerOrder["Candy & Snacks"] * scale)}).`,
      `Method: department mix from all orders May–Oct 2026, scaled to ${money(PLAN[0].aov)}, against May–Oct 2025 as measured. ` +
        `Headroom per department = (top-quartile store's order share − average order share) × average department ticket, for stores with 6+ orders; ` +
        `25% of that gap closed by Apr '27, 50% by Oct '27; Tobacco flat; Beverage fills the remainder of the plan. ` +
        (SKUS
          ? `SKUs per store per year = distinct SKUs bought in the year by stores with 12+ orders; Apr and Oct grow in line with each department's dollars, ` +
            `so they assume spend per SKU holds.`
          : `Cases per order = department dollars ÷ today's dollars per case in that department, so the case counts assume prices and pack sizes hold.`),
    ].join("\n\n"),
  );
}

// ---------- slide 2: where and how to grow ----------

{
  const slide = addFrame("Where and How to Grow", [
    { text: `Beverage is already in ${pct(share("Beverage").today)} of orders. `, options: { fontFace: FONT.book } },
    { text: "The room is in the rest of the store.", options: { fontFace: FONT.bold } },
  ]);

  const TOP = 1.95;
  const BOTTOM = 6.8;
  const HALF_GAP = 0.35;
  const PW = (X1 - X0 - HALF_GAP) / 2;

  const panel = (x: number, title: string, name: string) => {
    slide.addShape(pres.ShapeType.roundRect, {
      x, y: TOP, w: PW, h: BOTTOM - TOP, rectRadius: 0.12, fill: { color: COLOR.panel }, line: { color: "EFE9F5", width: 0.75 },
      shadow: { type: "outer", color: "5C2E91", opacity: 0.08, blur: 8, offset: 2, angle: 90 },
      objectName: `${name} panel`,
    });
    slide.addText(title, {
      x: x + 0.3, y: TOP + 0.18, w: PW - 0.6, h: 0.4, margin: 0, fontFace: FONT.black, fontSize: 20, color: COLOR.purple,
      isTextBox: true, objectName: `${name} title`,
    });
  };

  // Left half: where to grow. One bar per department on a 0-100% track of orders: blue = today,
  // orange = what the 12-month plan adds, red = what is left up to the top-quartile store.
  const PX = X0;
  panel(PX, "Where to grow", "Where to grow");
  slide.addText(SCALE_TO_BEST ? "% of orders, each bar to its top-quartile store" : "% of orders that include the department", {
    x: PX + 0.3, y: TOP + 0.56, w: PW - 0.6, h: 0.26, margin: 0, valign: "top", fontFace: FONT.book, fontSize: 12, color: COLOR.muted,
    isTextBox: true, objectName: "Where to grow subtitle",
  });

  const BX = PX + 0.3;
  const BW = PW - 0.6;
  const SEGMENTS = [
    { name: "Today", color: COLOR.today_bar },
    { name: "12-mo plan", color: COLOR.plan_bar },
    { name: "Headroom to top quartile", color: COLOR.head_bar },
  ];
  let lx = BX;
  SEGMENTS.forEach((s) => {
    slide.addShape(pres.ShapeType.rect, {
      x: lx, y: TOP + 0.92, w: 0.13, h: 0.13, fill: { color: s.color }, line: { type: "none" }, objectName: `Legend ${s.name} key`,
    });
    const w = s.name.length * 0.075 + 0.1;
    slide.addText(s.name, {
      x: lx + 0.19, y: TOP + 0.88, w, h: 0.21, margin: 0, valign: "middle", fontFace: FONT.book, fontSize: 10.5, color: COLOR.ink,
      isTextBox: true, objectName: `Legend ${s.name}`,
    });
    lx += 0.19 + w + 0.2;
  });

  const chartDepts: Dept[] = ["Beverage", ...[...crossDepts].sort((a, b) => headroom[b] - headroom[a])];
  const BAR_Y0 = TOP + 1.17;
  const BAR_ROW = 0.41;
  const BAR_H = 0.2;
  chartDepts.forEach((d, r) => {
    const y = BAR_Y0 + r * BAR_ROW;
    const s = share(d);
    // Whole percentage points, so the labels add up.
    const pts = [Math.round(s.today * 100), Math.round(s.plan * 100), Math.round(s.top * 100)] as const;
    const parts = [pts[0], pts[1] - pts[0], pts[2] - pts[1]];
    slide.addText(d === "Other" ? "All other" : d, {
      x: BX, y, w: BW * 0.62, h: 0.18, margin: 0, valign: "middle", fontFace: FONT.bold, fontSize: 11, color: COLOR.ink,
      isTextBox: true, objectName: `Bar label ${d}`,
    });
    slide.addText(`top quartile ${pts[2]}%`, {
      x: BX + BW * 0.5, y, w: BW * 0.5, h: 0.18, margin: 0, align: "right", valign: "middle", fontFace: FONT.book, fontSize: 10,
      color: COLOR.muted, isTextBox: true, objectName: `Bar benchmark ${d}`,
    });
    slide.addShape(pres.ShapeType.rect, {
      x: BX, y: y + 0.2, w: BW, h: BAR_H, fill: { color: COLOR.track }, line: { type: "none" }, objectName: `Bar ${d} track`,
    });
    let x = BX;
    parts.forEach((v, k) => {
      const w = (v / (SCALE_TO_BEST ? pts[2] : 100)) * BW;
      if (w <= 0) return;
      const seg = SEGMENTS[k]!;
      // Label a segment only when the label fits inside it.
      const label = w < (k === 0 ? 0.4 : 0.22) ? "" : k === 0 ? `${v}%` : `+${v}`;
      slide.addText(label, {
        x, y: y + 0.2, w, h: BAR_H, margin: 0, align: "center", valign: "middle", fontFace: FONT.bold, fontSize: 10,
        color: COLOR.white, fill: { color: seg.color }, objectName: `Bar ${d} ${seg.name}`,
      });
      x += w;
    });
    // A dotted blue line from the end of the headroom to the end of the track: the orders even the
    // top-quartile store does not reach yet.
    const rest = BX + BW - x;
    if (rest > 0.05) {
      slide.addShape(pres.ShapeType.line, {
        x: x + 0.04, y: y + 0.2 + BAR_H / 2, w: rest - 0.04, h: 0,
        line: { color: COLOR.today_bar, width: 1.75, dashType: "sysDot" }, objectName: `Bar ${d} rest`,
      });
    }
  });

  const calloutY = BAR_Y0 + chartDepts.length * BAR_ROW + 0.08;
  slide.addShape(pres.ShapeType.roundRect, {
    x: PX + 0.25, y: calloutY, w: PW - 0.5, h: BOTTOM - calloutY - 0.15, rectRadius: 0.08, fill: { color: COLOR.white },
    line: { type: "none" }, objectName: "Headroom callout",
  });
  slide.addText(money(totalHeadroom), {
    x: PX + 0.4, y: calloutY, w: 1.1, h: BOTTOM - calloutY - 0.15, margin: 0, valign: "middle", fontFace: FONT.black, fontSize: 26,
    color: COLOR.magenta, isTextBox: true, objectName: "Headroom value",
  });
  slide.addText(
    [
      { text: "more per order outside Beverage if every store bought like the top quartile. ", options: { fontFace: FONT.bold } },
      { text: "The plan needs half.", options: { fontFace: FONT.book } },
    ],
    {
      x: PX + 1.55, y: calloutY, w: PW - 1.95, h: BOTTOM - calloutY - 0.15, margin: 0, valign: "middle", fontSize: 11, color: COLOR.ink,
      isTextBox: true, objectName: "Headroom text",
    },
  );

  // Right half: how to grow. The four Concierge levers on the left, and the Concierge demo on a
  // phone on the right: the screen recording plays in the slideshow, with a still as its cover.
  // The recording and the still live in data/raw/ (gitignored); without them the phone is skipped.
  const HX = X0 + PW + HALF_GAP;
  panel(HX, "How to grow", "How to grow");
  const VIDEO = join(ROOT, "data/raw/concierge.mp4");
  const COVER = join(ROOT, "data/raw/concierge-cover.png");
  const hasDemo = existsSync(VIDEO) && existsSync(COVER);
  // The screen is the recording itself; the phone's bezel and rim are drawn around it.
  const PHONE_H = BOTTOM - TOP - 0.86;
  const PHONE_W = PHONE_H * (632 / 1332); // the recording's aspect ratio
  const PHONE_X = HX + PW - 0.45 - PHONE_W;
  const PHONE_Y = TOP + 0.38;
  const LIST_W = (hasDemo ? PHONE_X - 0.33 : HX + PW - 0.3) - (HX + 0.3);

  slide.addText(
    [
      { text: "The owner stays in control.", options: { fontFace: FONT.book, color: COLOR.ink, breakLine: true } },
      { text: "Mercaso does the work.", options: { fontFace: FONT.black, color: COLOR.magenta } },
    ],
    { x: HX + 0.3, y: TOP + 0.62, w: LIST_W, h: 0.6, margin: 0, valign: "top", fontSize: 14, isTextBox: true, objectName: "How to grow tagline" },
  );

  const LEVERS = [
    { name: "AI Ordering Agent", note: "Spots what is running low and puts it back in the cart" },
    { name: "AI Receiving Agent", note: "Checks each delivery in against the order" },
    { name: "AI Pricing Agent", note: "Keeps shelf prices and POS settings right" },
    { name: "Smart Recommendations", note: "Brings in the top items other stores carry" },
  ];
  const LIST_Y0 = TOP + 1.45;
  const LIST_ROW = (BOTTOM - 0.3 - LIST_Y0) / LEVERS.length;
  LEVERS.forEach((lv, i) => {
    const y = LIST_Y0 + i * LIST_ROW;
    if (i > 0) {
      slide.addShape(pres.ShapeType.line, {
        x: HX + 0.3, y, w: LIST_W, h: 0, line: { color: COLOR.line, width: 0.75 }, objectName: `Lever rule ${i}`,
      });
    }
    slide.addText(String(i + 1).padStart(2, "0"), {
      x: HX + 0.3, y, w: 0.42, h: LIST_ROW, margin: 0, valign: "middle", fontFace: FONT.black, fontSize: 18, color: COLOR.magenta,
      isTextBox: true, objectName: `Lever ${i + 1} number`,
    });
    slide.addShape(pres.ShapeType.line, {
      x: HX + 0.74, y: y + LIST_ROW * 0.3, w: 0, h: LIST_ROW * 0.4, line: { color: "B9B4C8", width: 1 }, objectName: `Lever ${i + 1} divider`,
    });
    slide.addText(
      [
        { text: lv.name, options: { fontFace: FONT.bold, fontSize: 13, color: COLOR.ink, breakLine: true } },
        { text: lv.note, options: { fontFace: FONT.book, fontSize: 10.5, color: COLOR.muted } },
      ],
      { x: HX + 0.86, y, w: LIST_W - 0.56, h: LIST_ROW, margin: 0, valign: "middle", isTextBox: true, objectName: `Lever ${i + 1}` },
    );
  });

  if (hasDemo) {
    // Phone around the recording, drawn from shapes. The bezel is a thick black outline laid over
    // the video's edge: wide enough (and its corners round enough) to hide the video's square
    // corners, so the screen reads as rounded. A light rim, side buttons and a notch finish it.
    const around = (pad: number) => ({ x: PHONE_X - pad, y: PHONE_Y - pad, w: PHONE_W + 2 * pad, h: PHONE_H + 2 * pad });
    const BEZEL = 0.08; // outline width, inches; half of it overlaps the screen edge
    const BEZEL_PAD = 0.02; // the outline's centre line sits just outside the video
    const BEZEL_R = 0.16; // round enough that the outline still covers the video's square corners
    const RIM_PAD = BEZEL_PAD + BEZEL / 2 + 0.018;

    // Side buttons first, so the rim covers their inner ends.
    const buttons = [
      { x: PHONE_X - RIM_PAD - 0.035, y: PHONE_Y + 0.55, h: 0.22 },
      { x: PHONE_X - RIM_PAD - 0.035, y: PHONE_Y + 0.9, h: 0.38 },
      { x: PHONE_X - RIM_PAD - 0.035, y: PHONE_Y + 1.36, h: 0.38 },
      { x: PHONE_X + PHONE_W + RIM_PAD - 0.015, y: PHONE_Y + 1.0, h: 0.55 },
    ];
    buttons.forEach((b, i) => {
      slide.addShape(pres.ShapeType.roundRect, {
        x: b.x, y: b.y, w: 0.05, h: b.h, rectRadius: 0.02, fill: { color: "C9C8CF" }, line: { type: "none" }, objectName: `Phone button ${i + 1}`,
      });
    });
    // Rim and body: a light frame with a soft shadow, filled black so nothing shows between rim and bezel.
    slide.addShape(pres.ShapeType.roundRect, {
      ...around(RIM_PAD), rectRadius: BEZEL_R + RIM_PAD - BEZEL_PAD, fill: { color: "111111" }, line: { color: "E4E3E8", width: 1.5 },
      shadow: { type: "outer", color: "1D1B3A", opacity: 0.22, blur: 12, offset: 4, angle: 90 },
      objectName: "Phone body",
    });
    slide.addMedia({
      type: "video", path: VIDEO, ...around(0),
      cover: `data:image/png;base64,${readFileSync(COVER).toString("base64")}`, objectName: "Mercaso Concierge demo",
    });
    slide.addShape(pres.ShapeType.roundRect, {
      ...around(BEZEL_PAD), rectRadius: BEZEL_R, fill: { type: "none" }, line: { color: "111111", width: BEZEL * 72 },
      objectName: "Phone bezel",
    });
    // Notch with speaker and camera, overlapping the top of the screen.
    const NOTCH_W = PHONE_W * 0.38;
    const notchX = PHONE_X + (PHONE_W - NOTCH_W) / 2;
    slide.addShape(pres.ShapeType.roundRect, {
      x: notchX, y: PHONE_Y - 0.06, w: NOTCH_W, h: 0.2, rectRadius: 0.09, fill: { color: "111111" }, line: { type: "none" }, objectName: "Phone notch",
    });
    slide.addShape(pres.ShapeType.roundRect, {
      x: notchX + NOTCH_W * 0.3, y: PHONE_Y + 0.03, w: NOTCH_W * 0.3, h: 0.035, rectRadius: 0.017, fill: { color: "3A3A40" },
      line: { type: "none" }, objectName: "Phone speaker",
    });
    slide.addShape(pres.ShapeType.ellipse, {
      x: notchX + NOTCH_W * 0.68, y: PHONE_Y + 0.022, w: 0.05, h: 0.05, fill: { color: "3A3A40" }, line: { type: "none" }, objectName: "Phone camera",
    });
  } else {
    console.warn("No data/raw/concierge.mp4 and concierge-cover.png: the How to grow phone is left out.");
  }

  addFootnote(
    slide,
    `Share of orders May–Oct 2026, stores with 6+ orders. Top quartile: 75th-percentile store by share of orders that include the department. ` +
      `Plan closes 50% of the gap by Oct '27 (25% by Apr '27).`,
    6.95,
  );

  slide.addNotes(
    [
      `Beverage is already in ${pct(share("Beverage").today)} of orders, against ${pct(share("Beverage").top)} at our top-quartile stores, so it can no longer ` +
        `grow by showing up in more orders. What is left there is bigger beverage tickets.`,
      `The room is in the rest of the store. Only about a third of orders include Grocery, and only a fifth to a quarter include Cleaning, Household, ` +
        `or Health & Beauty. Our top-quartile stores already buy these far more often. If every store bought like them, at today's ticket sizes, ` +
        `the order would be ${money(totalHeadroom)} bigger. The plan needs half of that by October.`,
      `How we get there is Mercaso Concierge. The owner stays in control; Mercaso does the work. The AI Ordering Agent spots what is running ` +
        `low and puts it back in the cart, the AI Receiving Agent checks deliveries in, the AI Pricing Agent keeps prices and POS settings right, ` +
        `and Smart Recommendations bring in the top items other stores carry. On the phone: Concierge greets the owner with what needs ` +
        `attention, from a Coca-Cola reorder to a sales tax deadline, and each item is one tap.`,
      `Method: share of orders that include each department, May–Oct 2026, stores with 6+ orders. Top quartile = 75th-percentile store on that share. ` +
        `Headroom per department = (top-quartile share − average share) × average department ticket. The 12-month plan closes half of the gap.`,
    ].join("\n\n"),
  );
}

// ---------- slide 3: gaps in the market ----------

// The store plan (Rick, 2026-11-05): the market is Rick's grossed-up universe of stores, and
// Mercaso's active and total customers today, in six months and in twelve.
const NETWORK = {
  universe: 18416,
  steps: [
    { label: "TODAY", sub: "Oct '26", active: 3448, total: 6602 },
    { label: "6 MONTHS", sub: "Apr '27", active: 3913, total: 7278 },
    { label: "12 MONTHS", sub: "Oct '27", active: 4416, total: 8158 },
  ],
} as const;

// The market-gaps map: one stretch of Central Long Beach at street level (OpenStreetMap) with every
// store we can place there. scripts/slides/gap_map.py renders the street map to dist/slides/gap-map.png
// and writes the stores' positions and counts to gap-map.json; this places the map and draws the
// store markers, legend and scale natively, so they stay sharp and editable.
interface GapMap {
  area: { name: string; span: string };
  aspect: number;
  width_km: number;
  height_km: number;
  active: number;
  visited: number;
  churned: number;
  prospects: number;
  prospect_source: "list" | "visits";
  markers: { kind: "active" | "visited" | "churned" | "prospect"; fx: number; fy: number }[];
}
const GAP_PNG = join(ROOT, "dist/slides/gap-map.png");
const GAP_JSON = join(ROOT, "dist/slides/gap-map.json");
const gapMap: GapMap | undefined = existsSync(GAP_JSON) && existsSync(GAP_PNG) ? JSON.parse(readFileSync(GAP_JSON, "utf8")) : undefined;
if (!gapMap) console.warn("No dist/slides/gap-map.png: run python3 scripts/slides/gap_map.py for the slide 3 map.");

// Store markers (Rick, 2026-11-05): green check for active stores, yellow exclamation mark for
// prospects visited that never ordered, red X for churned stores (icons drawn by gap_map.py), and a
// white dot with a pink ring for prospects never visited.
const MARKER = {
  active: { icon: "icon-active.png", label: "active", color: "1FA463" },
  visited: { icon: "icon-visited.png", label: "visited, never ordered", color: "D99A00" },
  churned: { icon: "icon-churned.png", label: "churned", color: "E03131" },
  prospect: { icon: "", label: "prospects, never visited", color: COLOR.magenta },
} as const;
type MarkerKind = keyof typeof MARKER;

/** A store marker: its icon, or for a prospect never visited a white dot with a pink ring. */
function marker(slide: Slide, kind: MarkerKind, cx: number, cy: number, d: number, name: string) {
  const m = MARKER[kind];
  if (m.icon) {
    slide.addImage({ path: join(ROOT, "dist/slides", m.icon), x: cx - d / 2, y: cy - d / 2, w: d, h: d, altText: m.label, objectName: name });
  } else {
    const r = d * 0.82;
    slide.addShape(pres.ShapeType.ellipse, {
      x: cx - r / 2, y: cy - r / 2, w: r, h: r, fill: { color: COLOR.white }, line: { color: COLOR.magenta, width: 1.75 }, objectName: name,
    });
  }
}

function drawGapMap(slide: Slide, g: GapMap, x0: number, y0: number, maxW: number, maxH: number) {
  maxH -= 0.56; // room for the summary and legend rows under the map
  const w = Math.min(maxW, maxH * g.aspect);
  const h = w / g.aspect;
  const mx = x0 + (maxW - w) / 2;
  slide.addImage({ path: GAP_PNG, x: mx, y: y0, w, h, altText: `Street map of ${g.area.name}`, objectName: "Street map" });
  slide.addShape(pres.ShapeType.rect, {
    x: mx, y: y0, w, h, fill: { type: "none" }, line: { color: "D9D3E3", width: 0.75 }, objectName: "Street map frame",
  });

  // 1 km scale bar, top right, and the map credit, bottom right.
  const km = w / g.width_km;
  const sy = y0 + 0.12;
  const sx = mx + w - 0.12 - (km + 0.42); // left edge of the backing
  slide.addShape(pres.ShapeType.rect, {
    x: sx, y: sy - 0.04, w: km + 0.42, h: 0.2, fill: { color: COLOR.white, transparency: 15 }, line: { type: "none" }, objectName: "Scale backing",
  });
  slide.addShape(pres.ShapeType.line, { x: sx + 0.06, y: sy + 0.06, w: km, h: 0, line: { color: COLOR.ink, width: 2 }, objectName: "Scale bar" });
  slide.addText("1 km", {
    x: sx + 0.08 + km, y: sy - 0.02, w: 0.32, h: 0.16, margin: 0, valign: "middle", fontFace: FONT.bold, fontSize: 7.5, color: COLOR.ink,
    isTextBox: true, objectName: "Scale label",
  });
  slide.addText("© OpenStreetMap contributors", {
    x: mx + w - 1.65, y: y0 + h - 0.18, w: 1.6, h: 0.15, margin: 0, align: "right", valign: "middle", fontFace: FONT.book, fontSize: 6.5,
    color: "555555", fill: { color: COLOR.white, transparency: 20 }, objectName: "Map credit",
  });

  // One marker per store; prospects never visited first, then visited, then churned, then ours on top.
  const d = 0.15;
  g.markers.forEach((m, i) => marker(slide, m.kind, mx + m.fx * w, y0 + m.fy * h, d, `Store ${i + 1} (${m.kind})`));

  // Under the map: the stretch's total and how much of it we serve, then each group with its share.
  const total = g.active + g.visited + g.churned + g.prospects;
  const share = (n: number) => `${Math.round((n / total) * 100)}%`;
  slide.addText(
    [
      { text: `${total} stores`, options: { fontFace: FONT.black, fontSize: 11, color: COLOR.ink } },
      { text: " in this stretch · we serve ", options: { fontFace: FONT.book, fontSize: 10, color: COLOR.ink } },
      { text: share(g.active), options: { fontFace: FONT.black, fontSize: 11, color: MARKER.active.color } },
      { text: ` · ${total - g.active} left to win (${share(total - g.active)})`, options: { fontFace: FONT.book, fontSize: 10, color: COLOR.ink } },
    ],
    { x: x0, y: y0 + h + 0.07, w: maxW, h: 0.22, margin: 0, valign: "middle", isTextBox: true, objectName: "Map summary" },
  );
  const rows: [MarkerKind, number][] = [["active", g.active], ["visited", g.visited], ["churned", g.churned], ["prospect", g.prospects]];
  // Spread across the panel's full width, each column sized to its label.
  const need = rows.map(([kind, n]) => 0.2 + String(n).length * 0.075 + (share(n).length + MARKER[kind].label.length + 2) * 0.054);
  const spare = (maxW - need.reduce((a, b) => a + b, 0)) / (rows.length - 1);
  const starts = need.map((_, i) => x0 + need.slice(0, i).reduce((a, b) => a + b, 0) + i * Math.max(0.08, spare));
  rows.forEach(([kind, n], i) => {
    const lx = starts[i]!;
    const ly = y0 + h + 0.33;
    const k = MARKER[kind];
    marker(slide, kind, lx + 0.07, ly + 0.11, 0.15, `Map legend ${kind} marker`);
    slide.addText(
      [
        { text: `${n}`, options: { fontFace: FONT.black, fontSize: 10.5, color: k.color } },
        { text: ` ${k.label} `, options: { fontFace: FONT.book, fontSize: 8.5, color: COLOR.ink } },
        { text: share(n), options: { fontFace: FONT.bold, fontSize: 8.5, color: COLOR.muted } },
      ],
      { x: lx + 0.18, y: ly, w: need[i]! - 0.1, h: 0.22, margin: 0, valign: "middle", isTextBox: true, wrap: false, objectName: `Map legend ${kind}` },
    );
  });

}

{
  const pen = (n: number) => n / NETWORK.universe;
  const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;
  const now = NETWORK.steps[0];
  const oct = NETWORK.steps[2];
  const fmt = (n: number) => n.toLocaleString("en-US");
  const slide = addFrame("Gaps in the Market", [
    { text: `We serve ${pct(pen(now.total))} of an ${fmt(NETWORK.universe)}-store market. `, options: { fontFace: FONT.book } },
    { text: "We grow by filling the holes where we already win.", options: { fontFace: FONT.bold } },
  ]);

  const TOP = 1.95;
  const BOTTOM = 6.8;
  const GAP_X = 0.35;
  const KW = 4.55; // the stores panel on the right
  const MW = X1 - X0 - GAP_X - KW; // the map panel on the left
  const KX = X0 + MW + GAP_X;

  const panel = (x: number, w: number, title: string, subtitle: string, name: string) => {
    slide.addShape(pres.ShapeType.roundRect, {
      x, y: TOP, w, h: BOTTOM - TOP, rectRadius: 0.12, fill: { color: COLOR.panel }, line: { color: "EFE9F5", width: 0.75 },
      shadow: { type: "outer", color: "5C2E91", opacity: 0.08, blur: 8, offset: 2, angle: 90 },
      objectName: `${name} panel`,
    });
    slide.addText(title, {
      x: x + 0.3, y: TOP + 0.18, w: w - 0.6, h: 0.4, margin: 0, fontFace: FONT.black, fontSize: 20, color: COLOR.purple,
      isTextBox: true, objectName: `${name} title`,
    });
    slide.addText(subtitle, {
      x: x + 0.3, y: TOP + 0.58, w: w - 0.6, h: 0.26, margin: 0, valign: "top", fontFace: FONT.book, fontSize: 12, color: COLOR.muted,
      isTextBox: true, objectName: `${name} subtitle`,
    });
  };

  // Left: the map.
  panel(
    X0, MW, "Where the holes are",
    gapMap ? `${gapMap.area.name}, street by street · ${gapMap.area.span}` : "", "Map",
  );
  if (gapMap) drawGapMap(slide, gapMap, X0 + 0.3, TOP + 0.95, MW - 0.6, BOTTOM - 0.2 - (TOP + 0.95));

  // Right: total and active customers against the market, today and the plan's two steps. Each bar
  // is the whole market: active customers in purple, the rest of our customers in light purple.
  const LIGHT = "C7B8E3";
  panel(KX, KW, "Customers we serve", `of the ${fmt(NETWORK.universe)} stores in our market`, "Stores");
  const RX = KX + 0.3;
  const RW = KW - 0.6;
  slide.addShape(pres.ShapeType.rect, { x: RX, y: TOP + 0.9, w: 0.14, h: 0.1, fill: { color: COLOR.purple }, line: { type: "none" }, objectName: "Key active" });
  slide.addText("active", {
    x: RX + 0.2, y: TOP + 0.86, w: 0.6, h: 0.18, margin: 0, valign: "middle", fontFace: FONT.book, fontSize: 9, color: COLOR.ink, isTextBox: true, objectName: "Key active text",
  });
  slide.addShape(pres.ShapeType.rect, { x: RX + 0.8, y: TOP + 0.9, w: 0.14, h: 0.1, fill: { color: LIGHT }, line: { type: "none" }, objectName: "Key other" });
  slide.addText("other customers", {
    x: RX + 1.0, y: TOP + 0.86, w: 1.3, h: 0.18, margin: 0, valign: "middle", fontFace: FONT.book, fontSize: 9, color: COLOR.ink, isTextBox: true, objectName: "Key other text",
  });
  const ROW_Y0 = TOP + 1.18;
  const ROW_H = 0.96;
  NETWORK.steps.forEach((s, i) => {
    const y = ROW_Y0 + i * ROW_H;
    const added = s.total - now.total;
    if (i > 0) {
      slide.addShape(pres.ShapeType.line, {
        x: RX, y: y - 0.09, w: RW, h: 0, line: { color: COLOR.line, width: 0.75 }, objectName: `Stores rule ${i}`,
      });
    }
    slide.addText(
      [
        { text: `${s.label}  `, options: { fontFace: FONT.bold, fontSize: 10, charSpacing: 1, color: i === 2 ? COLOR.magenta : COLOR.muted } },
        { text: s.sub, options: { fontFace: FONT.book, fontSize: 10, color: COLOR.muted } },
      ],
      { x: RX, y, w: RW * 0.6, h: 0.2, margin: 0, valign: "middle", isTextBox: true, objectName: `${s.sub} label` },
    );
    if (added > 0) {
      slide.addText(`+${fmt(added)} customers`, {
        x: RX + RW * 0.45, y, w: RW * 0.55, h: 0.2, margin: 0, align: "right", valign: "middle", fontFace: FONT.bold, fontSize: 10.5,
        color: COLOR.magenta, isTextBox: true, objectName: `${s.sub} added`,
      });
    }
    slide.addText(
      [
        { text: fmt(s.total), options: { fontFace: FONT.black, fontSize: 24, color: COLOR.ink } },
        { text: "  customers", options: { fontFace: FONT.book, fontSize: 11, color: COLOR.muted, breakLine: true } },
        { text: fmt(s.active), options: { fontFace: FONT.bold, fontSize: 11, color: COLOR.purple } },
        { text: " active", options: { fontFace: FONT.book, fontSize: 10, color: COLOR.muted } },
      ],
      { x: RX, y: y + 0.2, w: RW * 0.68, h: 0.58, margin: 0, valign: "middle", lineSpacingMultiple: 0.95, isTextBox: true, objectName: `${s.sub} customers` },
    );
    slide.addText(
      [
        { text: pct1(pen(s.total)), options: { fontFace: FONT.black, fontSize: 20, color: i === 0 ? COLOR.purple : COLOR.magenta, breakLine: true } },
        { text: pct1(pen(s.active)), options: { fontFace: FONT.bold, fontSize: 11, color: COLOR.purple } },
        { text: " active", options: { fontFace: FONT.book, fontSize: 10, color: COLOR.muted } },
      ],
      { x: RX + RW * 0.5, y: y + 0.2, w: RW * 0.5, h: 0.58, margin: 0, align: "right", valign: "middle", lineSpacingMultiple: 0.95, isTextBox: true, objectName: `${s.sub} penetration` },
    );
    const barY = y + 0.8;
    slide.addShape(pres.ShapeType.rect, { x: RX, y: barY, w: RW, h: 0.1, fill: { color: COLOR.track }, line: { type: "none" }, objectName: `${s.sub} market bar` });
    slide.addShape(pres.ShapeType.rect, {
      x: RX, y: barY, w: RW * pen(s.total), h: 0.1, fill: { color: LIGHT }, line: { type: "none" }, objectName: `${s.sub} customers bar`,
    });
    slide.addShape(pres.ShapeType.rect, {
      x: RX, y: barY, w: RW * pen(s.active), h: 0.1, fill: { color: COLOR.purple }, line: { type: "none" }, objectName: `${s.sub} active bar`,
    });
  });

  const calloutY = ROW_Y0 + 3 * ROW_H + 0.02;
  slide.addShape(pres.ShapeType.roundRect, {
    x: KX + 0.25, y: calloutY, w: KW - 0.5, h: BOTTOM - calloutY - 0.15, rectRadius: 0.08, fill: { color: COLOR.white },
    line: { type: "none" }, objectName: "Open market callout",
  });
  slide.addText(pct(1 - pen(oct.total)), {
    x: KX + 0.4, y: calloutY, w: 1.05, h: BOTTOM - calloutY - 0.15, margin: 0, valign: "middle", fontFace: FONT.black, fontSize: 26,
    color: COLOR.magenta, isTextBox: true, objectName: "Open market value",
  });
  slide.addText(
    [
      { text: "of the market is still open ", options: { fontFace: FONT.bold } },
      { text: `after the plan's +${fmt(oct.total - now.total)} customers. We are far from saturated.`, options: { fontFace: FONT.book } },
    ],
    {
      x: KX + 1.5, y: calloutY, w: KW - 1.85, h: BOTTOM - calloutY - 0.15, margin: 0, valign: "middle", fontSize: 11, color: COLOR.ink,
      isTextBox: true, objectName: "Open market text",
    },
  );

  addFootnote(
    slide,
    `Market: ${fmt(NETWORK.universe)} stores (Rick's universe); customers = total customers, of which active; penetration = customers ÷ market. ` +
      `Map: active and churned stores at their address (Rick's market list, deduplicated); ` +
      (gapMap?.prospect_source === "list"
        ? `prospects from Rick's prospect list at their address; visited = at least one logged rep visit.`
        : `prospects are stores reps visited in the last 12 months that have never ordered, at the visit's GPS; prospects never visited aren't shown.`),
    6.9,
  );

  slide.addNotes(
    [
      `Our market is ${fmt(NETWORK.universe)} stores. We have ${fmt(now.total)} customers today, ${pct1(pen(now.total))} of it, and ${fmt(now.active)} of them ` +
        `are active (${pct1(pen(now.active))}). The plan takes customers to ${fmt(NETWORK.steps[1].total)} by April (${pct1(pen(NETWORK.steps[1].total))}) ` +
        `and ${fmt(oct.total)} by next October (${pct1(pen(oct.total))}), with active customers going from ${fmt(now.active)} to ${fmt(oct.active)}.`,
      `Even then, ${pct(1 - pen(oct.total))} of the market is still open. We are not saturated, and we are not going to spread thin across ` +
        `the whole map: we go after the holes next to where we already have density, where our routes, reps and reputation already are.`,
      ...(gapMap
        ? [
            `The map zooms into ${gapMap.area.name}, ${gapMap.width_km} by ${gapMap.height_km} km from ${gapMap.area.span}, street by street. ` +
              `Of the ${gapMap.active + gapMap.visited + gapMap.churned + gapMap.prospects} stores we know here, ${gapMap.active} are active (green check). ` +
              `Around them: ${gapMap.visited} prospects our reps have visited that never ordered (yellow exclamation mark), ${gapMap.churned} stores that ` +
              `churned (red X), and ${gapMap.prospects} prospects nobody has visited yet (pink ring). They sit on the same blocks as our stores, on the same routes: this is the hole we fill first, not a new territory.`,
          ]
        : []),
    ].join("\n\n"),
  );
}

mkdirSync(join(ROOT, "dist/slides"), { recursive: true });
await pres.writeFile({ fileName: OUT });
console.log(`wrote ${OUT}`);
