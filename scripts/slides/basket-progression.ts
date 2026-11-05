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

// The store plan (Rick, 2026-11-05): the market is Rick's cleaned store list (in-scope stores, no
// chains), and the stores Mercaso serves today, in six months and in twelve.
const NETWORK = {
  universe: 12416,
  steps: [
    { label: "TODAY", sub: "Oct '26", stores: 3448 },
    { label: "6 MONTHS", sub: "Apr '27", stores: 3913 },
    { label: "12 MONTHS", sub: "Oct '27", stores: 4416 },
  ],
} as const;

// The market-gaps map: one LA area on a hexagon grid. Each hexagon is shaded by the stores reps have
// visited there that have never ordered (the holes) and carries a purple dot sized by the active
// stores Mercaso already serves there (where we win). Built from map_customers.csv and
// map_visits.csv (`pnpm athena:export map-customers map-visits`).
//
// The area was picked by scanning 24 km squares over the LA basin for the most stores served and
// stores visited-not-ordering together (Inglewood to Downey, Compton to Koreatown). Visits carry the
// rep's GPS, not the store's address; where visits to 4+ different stores were logged at one spot
// (a rep logging from one place) they are left out. Checked on visits to existing customers: after
// that, 91% land within 300 m of the store.
const MAP = {
  name: "South & Central LA",
  span: "Inglewood to Downey, Compton to Koreatown",
  north: 34.114,
  west: -118.38,
  sizeKm: 24,
  hexKm: 1.4, // hexagon radius (centre to corner)
  crowdStores: 4,
  // Neighbourhoods to label, and to name the holes by.
  places: [
    { name: "Koreatown", lat: 34.058, lng: -118.3 },
    { name: "Downtown", lat: 34.045, lng: -118.25 },
    { name: "Hollywood", lat: 34.098, lng: -118.327 },
    { name: "Echo Park", lat: 34.078, lng: -118.26 },
    { name: "Boyle Heights", lat: 34.034, lng: -118.205 },
    { name: "East LA", lat: 34.024, lng: -118.172 },
    { name: "Commerce", lat: 34.0, lng: -118.159 },
    { name: "Leimert Park", lat: 34.004, lng: -118.333 },
    { name: "South LA", lat: 33.99, lng: -118.28 },
    { name: "Huntington Park", lat: 33.982, lng: -118.225 },
    { name: "Bell", lat: 33.977, lng: -118.187 },
    { name: "Inglewood", lat: 33.962, lng: -118.353 },
    { name: "Westmont", lat: 33.941, lng: -118.302 },
    { name: "Watts", lat: 33.94, lng: -118.24 },
    { name: "South Gate", lat: 33.955, lng: -118.212 },
    { name: "Downey", lat: 33.94, lng: -118.133 },
    { name: "Hawthorne", lat: 33.916, lng: -118.352 },
    { name: "Compton", lat: 33.905, lng: -118.22 },
    { name: "Lynwood", lat: 33.93, lng: -118.205 },
  ],
} as const;

const MAP_LABELS = new Set(["Hollywood", "Koreatown", "Downtown", "Boyle Heights", "South LA", "Huntington Park", "Inglewood", "Watts", "Compton", "Downey"]);

function drawGapMap(slide: Slide, x0: number, y0: number, side: number, xRight: number) {
  const KM_LAT = 111;
  const KM_LNG = 111 * Math.cos((34 * Math.PI) / 180);
  const toKm = (lat: number, lng: number) => ({ x: (lng - MAP.west) * KM_LNG, y: (MAP.north - lat) * KM_LAT });
  const inside = (p: { x: number; y: number }) => p.x >= 0 && p.x < MAP.sizeKm && p.y >= 0 && p.y < MAP.sizeKm;

  // Points: active stores at their address; never-ordered visited stores at the median of their
  // visits' GPS, after dropping crowded logging spots.
  const customers = csv("map_customers.csv").map((r) => ({ id: r.store_id ?? "", lat: Number(r.lat), lng: Number(r.lng) }));
  const active = new Set(customers.map((c) => c.id));
  const visits = csv("map_visits.csv").map((r) => ({ id: r.store_id ?? "", ordered: r.has_ordered === "1", lat: Number(r.lat), lng: Number(r.lng) }));
  const spot = (v: { lat: number; lng: number }) => `${v.lat.toFixed(3)},${v.lng.toFixed(3)}`;
  const storesAt = new Map<string, Set<string>>();
  for (const v of visits) (storesAt.get(spot(v)) ?? storesAt.set(spot(v), new Set()).get(spot(v))!).add(v.id);
  const byStore = new Map<string, { lat: number[]; lng: number[] }>();
  for (const v of visits) {
    if (v.ordered || active.has(v.id) || storesAt.get(spot(v))!.size >= MAP.crowdStores) continue;
    const s = byStore.get(v.id) ?? byStore.set(v.id, { lat: [], lng: [] }).get(v.id)!;
    s.lat.push(v.lat);
    s.lng.push(v.lng);
  }
  const median = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)]!;
  const open = [...byStore.values()].map((s) => toKm(median(s.lat), median(s.lng))).filter(inside);
  const served = customers.map((c) => toKm(c.lat, c.lng)).filter(inside);

  // Flat-top hexagon grid over the square.
  const R = MAP.hexKm;
  const H = Math.sqrt(3) * R;
  const hexes: { x: number; y: number; open: number; served: number }[] = [];
  for (let i = 0; i * 1.5 * R <= MAP.sizeKm; i++) {
    for (let j = 0; j * H + (i % 2 ? H / 2 : 0) <= MAP.sizeKm; j++) {
      hexes.push({ x: i * 1.5 * R, y: j * H + (i % 2 ? H / 2 : 0), open: 0, served: 0 });
    }
  }
  const nearest = (p: { x: number; y: number }) =>
    hexes.reduce((best, h) => ((h.x - p.x) ** 2 + (h.y - p.y) ** 2 < (best.x - p.x) ** 2 + (best.y - p.y) ** 2 ? h : best));
  for (const p of open) nearest(p).open++;
  for (const p of served) nearest(p).served++;

  // The three biggest holes next to where we already win: hexagon neighbourhoods (a hexagon and the
  // six around it) with the most open stores beyond the ones we serve, kept 5 km apart.
  const around = (h: (typeof hexes)[number]) => hexes.filter((o) => (o.x - h.x) ** 2 + (o.y - h.y) ** 2 <= (H * 1.05) ** 2);
  const pockets: { x: number; y: number; open: number; served: number; name: string }[] = [];
  // "Next to where we win": at least 15 stores served within two rings. Ranked by the gap, open minus served.
  const near = (h: (typeof hexes)[number]) => hexes.filter((o) => (o.x - h.x) ** 2 + (o.y - h.y) ** 2 <= (2 * H * 1.05) ** 2);
  const ranked = hexes
    .map((h) => ({ h, open: around(h).reduce((s, o) => s + o.open, 0), served: around(h).reduce((s, o) => s + o.served, 0), nearServed: near(h).reduce((s, o) => s + o.served, 0) }))
    .filter((n) => n.nearServed >= 15 && n.open > n.served)
    .sort((a, b) => b.open - b.served - (a.open - a.served));
  for (const n of ranked) {
    if (pockets.length === 3) break;
    if (pockets.some((p) => Math.hypot(p.x - n.h.x, p.y - n.h.y) < 5)) continue;
    const place = [...MAP.places].sort((a, b) => {
      const pa = toKm(a.lat, a.lng);
      const pb = toKm(b.lat, b.lng);
      return Math.hypot(pa.x - n.h.x, pa.y - n.h.y) - Math.hypot(pb.x - n.h.x, pb.y - n.h.y);
    })[0]!;
    pockets.push({ x: n.h.x, y: n.h.y, open: n.open, served: n.served, name: place.name });
  }

  // Draw. Each hexagon is coloured by the share of its known stores (served + visited, never
  // ordered) that we serve: purple where we win, magenta where the holes are, grey where reps have
  // found fewer than 3 stores. Then labels and the rings round the three holes.
  const s = side / (MAP.sizeKm + 2 * R); // inches per km, with room for the edge hexagons
  const ox = x0 + R * s;
  const oy = y0 + (H / 2) * s;
  const SHARE = [
    { min: 0.6, color: COLOR.purple, label: "60%+" },
    { min: 0.5, color: "AE9FD0", label: "50–60%" },
    { min: 0.4, color: "F57DB8", label: "40–50%" },
    { min: 0, color: COLOR.magenta, label: "under 40%" },
  ];
  const FEW = { color: "E9E5EF", label: "under 3 stores" };
  // Smoothed like a heatmap: a hexagon's share counts the six around it at half weight, so the holes
  // read as areas rather than single cells.
  const smooth = (h: (typeof hexes)[number]) => {
    const ring = around(h).filter((o) => o !== h);
    return {
      open: h.open + 0.5 * ring.reduce((t, o) => t + o.open, 0),
      served: h.served + 0.5 * ring.reduce((t, o) => t + o.served, 0),
    };
  };
  const shade = (h: (typeof hexes)[number]) => {
    const m = smooth(h);
    return h.open + h.served === 0 && m.open + m.served < 3 ? FEW.color : m.open + m.served < 3 ? FEW.color : SHARE.find((b) => m.served / (m.served + m.open) >= b.min)!.color;
  };
  hexes.forEach((h, k) => {
    slide.addShape(pres.ShapeType.hexagon, {
      x: ox + (h.x - R) * s, y: oy + (h.y - H / 2) * s, w: 2 * R * s, h: H * s,
      fill: { color: shade(h) }, line: { color: COLOR.panel, width: 1 }, objectName: `Hex ${k}`,
    });
  });
  // Rings round the three holes, each with a number badge (upper right) and its name on a tag
  // across the ring's bottom edge. Anchor neighbourhood labels go on small white tags, skipped where
  // they would sit on a badge or a hole's tag.
  type Box = { x: number; y: number; w: number; h: number };
  const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const tagW = (name: string) => name.length * 0.062 + 0.16;
  const TAG_H = 0.17;
  const taken: Box[] = [];
  pockets.forEach((p, i) => {
    const rr = 1.9 * R * s;
    const cx0 = ox + p.x * s;
    const cy0 = oy + p.y * s;
    slide.addShape(pres.ShapeType.ellipse, {
      x: cx0 - rr, y: cy0 - rr, w: 2 * rr, h: 2 * rr, fill: { type: "none" },
      line: { color: COLOR.ink, width: 1.75, dashType: "dash" }, objectName: `Pocket ${i + 1} ring`,
    });
    const b = 0.24;
    const badge = { x: cx0 + rr * 0.62, y: cy0 - rr * 0.62 - b, w: b, h: b };
    slide.addText(String(i + 1), {
      ...badge, margin: 0, align: "center", valign: "middle", shape: pres.ShapeType.ellipse, fill: { color: COLOR.ink },
      fontFace: FONT.black, fontSize: 10, color: COLOR.white, objectName: `Pocket ${i + 1} badge`,
    });
    const w = tagW(p.name);
    const tag = { x: cx0 - w / 2, y: cy0 + rr - TAG_H / 2, w, h: TAG_H };
    slide.addText(p.name, {
      ...tag, margin: 0, align: "center", valign: "middle", fontFace: FONT.bold, fontSize: 7.5, color: COLOR.white,
      shape: pres.ShapeType.roundRect, rectRadius: 0.05, fill: { color: COLOR.ink }, objectName: `Pocket ${i + 1} name`,
    });
    taken.push(badge, tag);
  });
  for (const p of MAP.places) {
    const q = toKm(p.lat, p.lng);
    if (!inside(q) || !MAP_LABELS.has(p.name) || pockets.some((k) => k.name === p.name)) continue;
    const w = tagW(p.name);
    const box = { x: ox + q.x * s - w / 2, y: oy + q.y * s - TAG_H / 2, w, h: TAG_H };
    if (taken.some((t) => hit(t, box))) continue;
    taken.push(box);
    slide.addText(p.name, {
      ...box, margin: 0, align: "center", valign: "middle", fontFace: FONT.bold, fontSize: 7.5, color: COLOR.ink,
      shape: pres.ShapeType.roundRect, rectRadius: 0.05, fill: { color: COLOR.white, transparency: 10 }, objectName: `Place ${p.name}`,
    });
  }

  // Side column: totals, legend and the three holes.
  const cx = x0 + side + 0.3;
  const cw = xRight - cx;
  let y = y0;
  slide.addText(
    [
      { text: served.length.toLocaleString("en-US"), options: { fontFace: FONT.black, fontSize: 16, color: COLOR.purple } },
      { text: " stores we serve", options: { fontFace: FONT.book, fontSize: 10, color: COLOR.ink, breakLine: true } },
      { text: open.length.toLocaleString("en-US"), options: { fontFace: FONT.black, fontSize: 16, color: COLOR.magenta } },
      { text: " visited, never ordered", options: { fontFace: FONT.book, fontSize: 10, color: COLOR.ink } },
    ],
    { x: cx, y, w: cw, h: 0.62, margin: 0, valign: "top", isTextBox: true, objectName: "Map totals" },
  );
  y += 0.74;
  slide.addText("Share of known stores we serve", {
    x: cx, y, w: cw, h: 0.18, margin: 0, fontFace: FONT.bold, fontSize: 8.5, color: COLOR.muted, isTextBox: true, objectName: "Share legend title",
  });
  y += 0.24;
  [...SHARE, FEW].forEach((b, i) => {
    const ky = y + i * 0.22;
    slide.addShape(pres.ShapeType.hexagon, {
      x: cx, y: ky, w: 0.2, h: 0.173, fill: { color: b.color }, line: { type: "none" }, objectName: `Share key ${b.label}`,
    });
    const note = i === 0 ? "  where we win" : i === 3 ? "  the holes" : "";
    slide.addText(
      [
        { text: b.label, options: { fontFace: FONT.book, color: COLOR.ink } },
        { text: note, options: { fontFace: FONT.bold, color: i === 0 ? COLOR.purple : COLOR.magenta } },
      ],
      { x: cx + 0.28, y: ky - 0.01, w: cw - 0.28, h: 0.19, margin: 0, valign: "middle", fontSize: 8.5, isTextBox: true, objectName: `Share key ${b.label} text` },
    );
  });
  y += 5 * 0.22 + 0.16;
  slide.addText("Biggest holes next to where we win", {
    x: cx, y, w: cw, h: 0.2, margin: 0, fontFace: FONT.bold, fontSize: 10, color: COLOR.purple, isTextBox: true, objectName: "Holes title",
  });
  y += 0.27;
  const rowH = (y0 + side - y) / 3;
  pockets.forEach((p, i) => {
    slide.addText(String(i + 1), {
      x: cx, y: y + i * rowH + 0.03, w: 0.22, h: 0.22, margin: 0, align: "center", valign: "middle", shape: pres.ShapeType.ellipse,
      fill: { color: COLOR.ink }, fontFace: FONT.black, fontSize: 9, color: COLOR.white, objectName: `Hole ${i + 1} badge`,
    });
    slide.addText(
      [
        { text: p.name, options: { fontFace: FONT.bold, fontSize: 10.5, color: COLOR.ink, breakLine: true } },
        { text: `${p.open} open · ${p.served} served`, options: { fontFace: FONT.book, fontSize: 9.5, color: COLOR.muted } },
      ],
      { x: cx + 0.3, y: y + i * rowH, w: cw - 0.3, h: Math.min(rowH, 0.42), margin: 0, valign: "top", isTextBox: true, objectName: `Hole ${i + 1}` },
    );
  });
  console.log(
    `Map ${MAP.name}: ${served.length} served, ${open.length} visited never ordered; holes: ` +
      pockets.map((p) => `${p.name} ${p.open} open / ${p.served} served`).join("; "),
  );
  return { served: served.length, open: open.length, pockets };
}

{
  const pen = (n: number) => n / NETWORK.universe;
  const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;
  const today = NETWORK.steps[0].stores;
  const oct = NETWORK.steps[2].stores;
  const slide = addFrame("Gaps in the Market", [
    { text: `We serve ${pct(pen(today))} of a ${NETWORK.universe.toLocaleString("en-US")}-store market. `, options: { fontFace: FONT.book } },
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
  panel(X0, MW, "Where the holes are", `${MAP.name} · ${MAP.span}`, "Map");
  const gap = drawGapMap(slide, X0 + 0.3, TOP + 0.95, BOTTOM - 0.22 - (TOP + 0.95), X0 + MW - 0.3);

  // Right: stores served and penetration, today and the plan's two steps. Each bar is the whole
  // market; today's stores in purple, what the plan adds in magenta.
  panel(KX, KW, "Stores we serve", `of the ${NETWORK.universe.toLocaleString("en-US")} stores in our market`, "Stores");
  const RX = KX + 0.3;
  const RW = KW - 0.6;
  const ROW_Y0 = TOP + 1.05;
  const ROW_H = 0.98;
  NETWORK.steps.forEach((s, i) => {
    const y = ROW_Y0 + i * ROW_H;
    const added = s.stores - today;
    if (i > 0) {
      slide.addShape(pres.ShapeType.line, {
        x: RX, y: y - 0.1, w: RW, h: 0, line: { color: COLOR.line, width: 0.75 }, objectName: `Stores rule ${i}`,
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
      slide.addText(`+${added.toLocaleString("en-US")} stores`, {
        x: RX + RW * 0.5, y, w: RW * 0.5, h: 0.2, margin: 0, align: "right", valign: "middle", fontFace: FONT.bold, fontSize: 11,
        color: COLOR.magenta, isTextBox: true, objectName: `${s.sub} added`,
      });
    }
    slide.addText(
      [
        { text: s.stores.toLocaleString("en-US"), options: { fontFace: FONT.black, fontSize: 26, color: COLOR.ink } },
        { text: "  stores", options: { fontFace: FONT.book, fontSize: 12, color: COLOR.muted } },
      ],
      { x: RX, y: y + 0.2, w: RW * 0.7, h: 0.44, margin: 0, valign: "middle", isTextBox: true, objectName: `${s.sub} stores` },
    );
    slide.addText(pct1(pen(s.stores)), {
      x: RX + RW * 0.5, y: y + 0.2, w: RW * 0.5, h: 0.44, margin: 0, align: "right", valign: "middle", fontFace: FONT.black, fontSize: 22,
      color: i === 0 ? COLOR.purple : COLOR.magenta, isTextBox: true, objectName: `${s.sub} penetration`,
    });
    const barY = y + 0.68;
    slide.addShape(pres.ShapeType.rect, {
      x: RX, y: barY, w: RW, h: 0.12, fill: { color: COLOR.track }, line: { type: "none" }, objectName: `${s.sub} market bar`,
    });
    slide.addShape(pres.ShapeType.rect, {
      x: RX, y: barY, w: RW * pen(today), h: 0.12, fill: { color: COLOR.purple }, line: { type: "none" }, objectName: `${s.sub} today bar`,
    });
    if (added > 0) {
      slide.addShape(pres.ShapeType.rect, {
        x: RX + RW * pen(today), y: barY, w: RW * (pen(s.stores) - pen(today)), h: 0.12, fill: { color: COLOR.magenta }, line: { type: "none" },
        objectName: `${s.sub} added bar`,
      });
    }
  });

  const calloutY = ROW_Y0 + 3 * ROW_H + 0.02;
  slide.addShape(pres.ShapeType.roundRect, {
    x: KX + 0.25, y: calloutY, w: KW - 0.5, h: BOTTOM - calloutY - 0.15, rectRadius: 0.08, fill: { color: COLOR.white },
    line: { type: "none" }, objectName: "Open market callout",
  });
  slide.addText(pct(1 - pen(oct)), {
    x: KX + 0.4, y: calloutY, w: 1.05, h: BOTTOM - calloutY - 0.15, margin: 0, valign: "middle", fontFace: FONT.black, fontSize: 26,
    color: COLOR.magenta, isTextBox: true, objectName: "Open market value",
  });
  slide.addText(
    [
      { text: "of the market is still open ", options: { fontFace: FONT.bold } },
      { text: `after the plan's +${(oct - today).toLocaleString("en-US")} stores. We are far from saturated.`, options: { fontFace: FONT.book } },
    ],
    {
      x: KX + 1.5, y: calloutY, w: KW - 1.85, h: BOTTOM - calloutY - 0.15, margin: 0, valign: "middle", fontSize: 11, color: COLOR.ink,
      isTextBox: true, objectName: "Open market text",
    },
  );

  addFootnote(
    slide,
    `Market: ${NETWORK.universe.toLocaleString("en-US")} in-scope independent stores (no chains, no out-of-scope types); penetration = stores ordering ÷ market. ` +
      `Map: active stores (ordered in 45 days) and stores reps visited in the last 12 months that have never ordered, placed by the visit's GPS ` +
      `(points where 4+ different stores were logged left out).`,
    6.9,
  );

  slide.addNotes(
    [
      `Our market is ${NETWORK.universe.toLocaleString("en-US")} independent stores, after taking out chains and store types we don't serve. ` +
        `We serve ${today.toLocaleString("en-US")} of them today, ${pct1(pen(today))}. The plan takes that to ` +
        `${NETWORK.steps[1].stores.toLocaleString("en-US")} by April (${pct1(pen(NETWORK.steps[1].stores))}) and ${oct.toLocaleString("en-US")} by next October ` +
        `(${pct1(pen(oct))}): ${(oct - today).toLocaleString("en-US")} more stores and ${((pen(oct) - pen(today)) * 100).toFixed(1)} points of penetration.`,
      `Even then, ${pct(1 - pen(oct))} of the market is still open. We are not saturated, and we are not going to spread thin across ` +
        `the whole map: we go after the holes next to where we already have density, where our routes, reps and reputation already are.`,
      `The map is ${MAP.name}, ${MAP.span}. Each hexagon is about 2.5 km across and is coloured by the share of the stores we know there ` +
        `that we serve: our ${gap.served} active stores, plus the ${gap.open} stores our reps visited in the last 12 months that have never ordered. ` +
        `Purple is where we win; magenta is where we don't yet. The holes sit right next to our density. The three biggest: ` +
        gap.pockets.map((k, i) => `${i + 1}. ${k.name}, ${k.open} stores open against ${k.served} we serve`).join("; ") + ".",
    ].join("\n\n"),
  );
}

mkdirSync(join(ROOT, "dist/slides"), { recursive: true });
await pres.writeFile({ fileName: OUT });
console.log(`wrote ${OUT}`);
