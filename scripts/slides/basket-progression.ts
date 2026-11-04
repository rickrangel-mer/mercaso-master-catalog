/**
 * Board slide: how the average order grows from today's $1,059 to $1,220 in twelve months, by
 * department, and where the room to grow is.
 *
 *   pnpm athena:export basket-mix basket-headroom basket-trend
 *   pnpm slides:basket            writes dist/slides/basket-progression.pptx
 *
 * The AOV path (today, Apr '27, Oct '27) is the plan's number, set below. Today's department mix
 * comes from basket_mix.csv (last six full months, all stores), scaled to the plan's starting AOV.
 * The growth is split with a simple, stated rule:
 *   - Cross-department lines (every department but Beverage and Tobacco) close a share of the gap
 *     between how often the typical order includes them and how often top-quartile stores' orders
 *     do, at today's ticket: headroom = (share_p75 - share_avg) * ticket (basket_headroom.csv).
 *     25% of that gap by Apr '27 and 50% by Oct '27.
 *   - Tobacco holds flat (it has been sliding and is not a growth lever).
 *   - Beverage fills the rest of the plan.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import pptxgenModule from "pptxgenjs";

// pptxgenjs is CommonJS: at runtime the default import is the class, but its types describe the module.
const pptxgen = pptxgenModule as unknown as typeof pptxgenModule.default;

const ROOT = process.cwd();
// Each room-to-grow bar runs to its own top-quartile store; --scale=full draws a 0-100% track instead.
const SCALE_TO_BEST = !process.argv.includes("--scale=full");
// --units=skus shows the distinct SKUs a regular store buys in a year beside the dollars, instead of
// cases per order (basket_store_skus.csv: stores with 12+ orders in the last twelve months).
const SKUS = process.argv.includes("--units=skus");
const UNIT = SKUS
  ? { short: "SKUs", long: "SKUs", header: "$ per order · SKUs per store / yr" }
  : { short: "cs", long: "cases", header: "$ per order · cases (cs)" };
const OUT = join(ROOT, `dist/slides/basket-progression${SKUS ? "-skus" : ""}${SCALE_TO_BEST ? "" : "-full"}.pptx`);

// The plan's AOV path.
const PLAN = [
  { key: "today", label: "TODAY", sub: "Oct '26", aov: 1059.4 },
  { key: "apr", label: "6 MONTHS", sub: "Apr '27", aov: 1112.07 },
  { key: "oct", label: "12 MONTHS", sub: "Oct '27", aov: 1219.57 },
] as const;
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

const mixRows = csv("basket_mix.csv");
const zero = () => Object.fromEntries(DEPARTMENTS.map((d) => [d, 0])) as Record<Dept, number>;
const perOrder = zero();
const casesPerOrder = zero();
const eachesPerOrder = zero();
const deptOf = (name: string | undefined): Dept =>
  (DEPARTMENTS as readonly string[]).includes(name ?? "") ? (name as Dept) : "Other";
for (const r of mixRows) {
  const d = deptOf(r.department);
  perOrder[d] += Number(r.per_order);
  casesPerOrder[d] += Number(r.cases_per_order);
  eachesPerOrder[d] += Number(r.units_per_order);
}
const measuredAov = DEPARTMENTS.reduce((s, d) => s + perOrder[d], 0);
const scale = PLAN[0].aov / measuredAov;

// Today's units beside the dollars. Cases are the default (how Mercaso sells), scaled with the dollars;
// eaches go in the notes only, since assortment items such as bags and cups count by the each.
// With --units=skus, distinct SKUs a regular store buys in a year.
const unitsToday = zero();
if (SKUS) {
  for (const r of csv("basket_store_skus.csv")) unitsToday[deptOf(r.department)] += Number(r.avg_skus_regular);
} else {
  for (const d of DEPARTMENTS) unitsToday[d] = casesPerOrder[d] * scale;
}

const head = Object.fromEntries(csv("basket_headroom.csv").map((r) => [r.department, r])) as Record<Dept, Record<string, string>>;
const headroom = Object.fromEntries(
  DEPARTMENTS.map((d) => {
    if (d === "Beverage" || d === "Tobacco") return [d, 0];
    const h = head[d];
    return [d, Math.max(0, Number(h.share_p75) - Number(h.share_avg)) * Number(h.ticket)];
  }),
) as Record<Dept, number>;
const totalHeadroom = DEPARTMENTS.reduce((s, d) => s + headroom[d], 0);

type Basket = Record<Dept, number>;
const baskets = Object.fromEntries(
  PLAN.map((p) => {
    const b = {} as Basket;
    for (const d of DEPARTMENTS) b[d] = perOrder[d] * scale + GAP_CLOSED[p.key] * headroom[d];
    b.Beverage += p.aov - DEPARTMENTS.reduce((s, d) => s + b[d], 0);
    return [p.key, b];
  }),
) as Record<(typeof PLAN)[number]["key"], Basket>;

/** Whole dollars that add up to the rounded total; Beverage absorbs the rounding. */
function rounded(b: Basket, total: number): Basket {
  const r = {} as Basket;
  for (const d of DEPARTMENTS) r[d] = Math.round(b[d]);
  r.Beverage += Math.round(total) - DEPARTMENTS.reduce((s, d) => s + r[d], 0);
  return r;
}
const shown = Object.fromEntries(PLAN.map((p) => [p.key, rounded(baskets[p.key], p.aov)])) as Record<(typeof PLAN)[number]["key"], Basket>;

const crossDepts = DEPARTMENTS.filter((d) => d !== "Beverage" && d !== "Tobacco");

// Share of orders that include each department, for the room-to-grow bars: today (order-weighted
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
type PlanKey = (typeof PLAN)[number]["key"];
const units = (p: PlanKey, d: Dept) => unitsToday[d] * (baskets[p][d] / baskets.today[d]);
const totalUnits = (p: PlanKey) => DEPARTMENTS.reduce((s, d) => s + units(p, d), 0);
const fmtUnits = (n: number) => (SKUS ? Math.round(n).toLocaleString("en-US") : n.toFixed(1));

// Trend over the year, for the notes.
const trend = csv("basket_trend.csv");
const months = [...new Set(trend.map((r) => r.month ?? ""))].sort();
const aovIn = (m: string) => trend.filter((r) => r.month === m).reduce((s, r) => s + Number(r.per_order), 0);
const deptIn = (m: string, d: string) => Number(trend.find((r) => r.month === m && r.department === d)?.per_order ?? 0);
const first = months[0] ?? "";
const last = months[months.length - 1] ?? "";
const aovChange = aovIn(last) - aovIn(first);
const bevChange = deptIn(last, "Beverage") - deptIn(first, "Beverage");

console.log(`Measured AOV ${measuredAov.toFixed(2)}, scaled by ${scale.toFixed(4)} to ${PLAN[0].aov}`);
console.log(`Top-quartile headroom ${totalHeadroom.toFixed(2)} per order`);
console.table(
  DEPARTMENTS.map((d) => ({
    department: d,
    today: shown.today[d],
    apr: shown.apr[d],
    oct: shown.oct[d],
    change: shown.oct[d] - shown.today[d],
    headroom: headroom[d].toFixed(1),
    unitsToday: fmtUnits(units("today", d)),
    unitsApr: fmtUnits(units("apr", d)),
    unitsOct: fmtUnits(units("oct", d)),
  })),
);
console.log(`${UNIT.long} ${SKUS ? "per store per year" : "per order"}: ${PLAN.map((p) => fmtUnits(totalUnits(p.key))).join(" / ")}`);
console.log(`Trend ${first} to ${last}: AOV ${aovChange.toFixed(0)}, Beverage ${bevChange.toFixed(0)}`);

// ---------- slide ----------

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
  barBase: "CFC9DD",
  white: "FFFFFF",
  today_bar: "2F6FDF",
  plan_bar: "F07E1A",
  head_bar: "D92D3F",
  track: "ECE8F2",
};
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5, same as the board deck
pres.title = "Growing the Basket";
pres.theme = { headFontFace: FONT.black, bodyFontFace: FONT.book };
const slide = pres.addSlide();
slide.background = { color: COLOR.white };

// Brand motif from the deck: a large pale circle bleeding off the corner.
slide.addShape(pres.ShapeType.ellipse, {
  x: 10.6, y: -2.6, w: 4.6, h: 4.6, fill: { color: COLOR.blush }, line: { type: "none" }, objectName: "Corner circle",
});

const X0 = 0.69;
slide.addText("Growing the Basket", {
  x: X0, y: 0.5, w: 9, h: 0.6, margin: 0, fontFace: FONT.black, fontSize: 32, color: COLOR.magenta, isTextBox: true,
  objectName: "Title",
});
slide.addText(
  [
    { text: "Beverage keeps growing, but ", options: { fontFace: FONT.book } },
    {
      text: `${pct((GAP_CLOSED.oct * totalHeadroom) / (PLAN[2].aov - PLAN[0].aov))} of the next ${money(PLAN[2].aov - PLAN[0].aov)} comes from the rest of the store.`,
      options: { fontFace: FONT.bold },
    },
  ],
  { x: X0, y: 1.15, w: 11.6, h: 0.45, margin: 0, fontSize: 18, color: COLOR.ink, isTextBox: true, objectName: "Subtitle" },
);

// --- basket table: department labels, three period cards, change column ---
const TOP = 1.95;
const BOTTOM = 6.75;
const HEADER_H = 1.3;
const ROW_Y0 = TOP + HEADER_H + 0.12;
const ROW_H = (BOTTOM - 0.1 - ROW_Y0) / DEPARTMENTS.length;
const LABEL_W = 2.2;
const CARD_W = 1.45;
const GAP = 0.1;
const cardX = (i: number) => X0 + LABEL_W + i * (CARD_W + GAP);
const DELTA_X = cardX(3);
const DELTA_W = 0.85;
const TABLE_RIGHT = DELTA_X + DELTA_W;

// Row rules behind everything, so the cards sit on top.
for (let i = 1; i < DEPARTMENTS.length; i++) {
  const y = ROW_Y0 + i * ROW_H;
  slide.addShape(pres.ShapeType.line, {
    x: X0, y, w: TABLE_RIGHT - X0, h: 0, line: { color: COLOR.line, width: 0.75 }, objectName: `Row rule ${i}`,
  });
}

const cardFill = [COLOR.today, COLOR.apr, COLOR.magenta];
PLAN.forEach((p, i) => {
  const x = cardX(i);
  const dark = i === 2;
  const fg = dark ? COLOR.white : COLOR.ink;
  const sub = dark ? "FFD6EC" : COLOR.muted;
  slide.addShape(pres.ShapeType.roundRect, {
    x, y: TOP, w: CARD_W, h: BOTTOM - TOP, rectRadius: 0.12, fill: { color: cardFill[i] }, line: { type: "none" },
    objectName: `${p.sub} card`,
  });
  slide.addText(
    [
      { text: p.label, options: { fontFace: FONT.bold, fontSize: 10, charSpacing: 1, color: dark ? COLOR.white : COLOR.magenta, breakLine: true } },
      { text: p.sub, options: { fontFace: FONT.book, fontSize: 11, color: sub } },
    ],
    { x, y: TOP + 0.14, w: CARD_W, h: 0.42, margin: 0, align: "center", valign: "top", isTextBox: true, objectName: `${p.sub} label` },
  );
  slide.addText(money(p.aov), {
    x, y: TOP + 0.56, w: CARD_W, h: 0.42, margin: 0, align: "center", valign: "middle", fontFace: FONT.black, fontSize: 24,
    color: fg, isTextBox: true, objectName: `${p.sub} AOV`,
  });
  const growth = p.aov - PLAN[0].aov;
  // With SKUs, the card also carries the store's yearly SKU total, the number the slide is about.
  const pctGrowth = `+${Math.round((growth / PLAN[0].aov) * 100)}%`;
  const skuTotal = `${fmtUnits(totalUnits(p.key))} SKUs`;
  const growthLine = SKUS
    ? i === 0 ? `${skuTotal} / yr` : `${pctGrowth} · ${skuTotal}`
    : i === 0 ? "avg. order" : `+${money(growth)} · ${pctGrowth}`;
  slide.addText(growthLine, {
    x, y: TOP + 0.98, w: CARD_W, h: 0.24, margin: 0, align: "center", valign: "middle", fontFace: FONT.bold, fontSize: 11,
    color: dark ? COLOR.white : i === 1 ? COLOR.magenta : COLOR.muted, isTextBox: true, objectName: `${p.sub} growth`,
  });

  DEPARTMENTS.forEach((d, r) => {
    const v = shown[p.key][d];
    slide.addText(
      [
        { text: money(v), options: { fontFace: FONT.bold, fontSize: 14, color: fg } },
        { text: `  ${fmtUnits(units(p.key, d))} ${UNIT.short}`, options: { fontFace: FONT.book, fontSize: 10, color: sub } },
      ],
      { x, y: ROW_Y0 + r * ROW_H, w: CARD_W, h: ROW_H, margin: 0, align: "center", valign: "middle", isTextBox: true,
        objectName: `${p.sub} ${d}` },
    );
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
slide.addText(
  [
    { text: "CHANGE", options: { fontFace: FONT.bold, charSpacing: 1, breakLine: true } },
    { text: "in 12 months", options: { fontFace: FONT.book } },
  ],
  { x: DELTA_X, y: ROW_Y0 - 0.5, w: DELTA_W, h: 0.42, margin: 0, align: "right", valign: "bottom", fontSize: 10, color: COLOR.muted,
    isTextBox: true, objectName: "Change header" },
);
DEPARTMENTS.forEach((d, r) => {
  const y = ROW_Y0 + r * ROW_H;
  const cross = crossDepts.includes(d as (typeof crossDepts)[number]);
  slide.addText(LABEL[d], {
    x: X0, y, w: LABEL_W - 0.1, h: ROW_H, margin: 0, valign: "middle", fontFace: cross ? FONT.bold : FONT.book, fontSize: 14,
    color: COLOR.ink, isTextBox: true, objectName: `Label ${d}`,
  });
  const change = shown.oct[d] - shown.today[d];
  slide.addText(change === 0 ? "flat" : `+${money(change)}`, {
    x: DELTA_X, y, w: DELTA_W, h: ROW_H, margin: 0, align: "right", valign: "middle", fontFace: FONT.black, fontSize: 14,
    color: change === 0 ? COLOR.muted : cross ? COLOR.magenta : COLOR.ink, isTextBox: true, objectName: `Change ${d}`,
  });
});

// --- room to grow panel ---
const PX = TABLE_RIGHT + 0.35;
const PW = 12.65 - PX;
slide.addShape(pres.ShapeType.roundRect, {
  x: PX, y: TOP, w: PW, h: BOTTOM - TOP, rectRadius: 0.12, fill: { color: COLOR.panel }, line: { color: "EFE9F5", width: 0.75 },
  shadow: { type: "outer", color: "5C2E91", opacity: 0.08, blur: 8, offset: 2, angle: 90 },
  objectName: "Room to grow panel",
});
slide.addText("Room to grow", {
  x: PX + 0.25, y: TOP + 0.15, w: PW - 0.5, h: 0.4, margin: 0, fontFace: FONT.black, fontSize: 18, color: COLOR.purple,
  isTextBox: true, objectName: "Panel title",
});
slide.addText(SCALE_TO_BEST ? "% of orders, each bar to its top-quartile store" : "% of orders that include the department", {
  x: PX + 0.25, y: TOP + 0.53, w: PW - 0.5, h: 0.24, margin: 0, valign: "top", fontFace: FONT.book, fontSize: 11, color: COLOR.muted,
  isTextBox: true, objectName: "Panel subtitle",
});

// One bar per department on a 0-100% track of orders: blue = today, orange = what the 12-month
// plan adds, red = what is left up to the top-quartile store. Built from shapes so each
// department's name sits above a full-width bar.
const BX = PX + 0.25;
const BW = PW - 0.5;
const SEGMENTS = [
  { name: "Today", color: COLOR.today_bar },
  { name: "12-mo plan", color: COLOR.plan_bar },
  { name: "Headroom", color: COLOR.head_bar },
];
let lx = BX;
SEGMENTS.forEach((s) => {
  slide.addShape(pres.ShapeType.rect, {
    x: lx, y: TOP + 0.88, w: 0.12, h: 0.12, fill: { color: s.color }, line: { type: "none" }, objectName: `Legend ${s.name} key`,
  });
  const w = s.name.length * 0.075 + 0.1;
  slide.addText(s.name, {
    x: lx + 0.17, y: TOP + 0.84, w, h: 0.2, margin: 0, valign: "middle", fontFace: FONT.book, fontSize: 10, color: COLOR.ink,
    isTextBox: true, objectName: `Legend ${s.name}`,
  });
  lx += 0.17 + w + 0.15;
});

const chartDepts: Dept[] = ["Beverage", ...[...crossDepts].sort((a, b) => headroom[b] - headroom[a])];
const BAR_Y0 = TOP + 1.13;
const BAR_ROW = 0.425;
const BAR_H = 0.19;
chartDepts.forEach((d, r) => {
  const y = BAR_Y0 + r * BAR_ROW;
  const s = share(d);
  // Whole percentage points, so the labels add up.
  const pts = [Math.round(s.today * 100), Math.round(s.plan * 100), Math.round(s.top * 100)] as const;
  const parts = [pts[0], pts[1] - pts[0], pts[2] - pts[1]];
  slide.addText(d === "Other" ? "All other" : d, {
    x: BX, y, w: BW * 0.62, h: 0.17, margin: 0, valign: "middle", fontFace: FONT.bold, fontSize: 10, color: COLOR.ink,
    isTextBox: true, objectName: `Bar label ${d}`,
  });
  slide.addText(`top quartile ${pts[2]}%`, {
    x: BX + BW * 0.5, y, w: BW * 0.5, h: 0.17, margin: 0, align: "right", valign: "middle", fontFace: FONT.book, fontSize: 9,
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
    const label = w < (k === 0 ? 0.4 : 0.19) ? "" : k === 0 ? `${v}%` : `+${v}`;
    slide.addText(label, {
      x, y: y + 0.2, w, h: BAR_H, margin: 0, align: "center", valign: "middle", fontFace: FONT.bold, fontSize: 9,
      color: COLOR.white, fill: { color: seg.color }, objectName: `Bar ${d} ${seg.name}`,
    });
    x += w;
  });
});

const calloutY = BAR_Y0 + chartDepts.length * BAR_ROW + 0.08;
slide.addShape(pres.ShapeType.roundRect, {
  x: PX + 0.2, y: calloutY, w: PW - 0.4, h: BOTTOM - calloutY - 0.14, rectRadius: 0.08, fill: { color: COLOR.white },
  line: { type: "none" }, objectName: "Headroom callout",
});
slide.addText(money(totalHeadroom), {
  x: PX + 0.35, y: calloutY + 0.02, w: 0.95, h: 0.56, margin: 0, valign: "middle", fontFace: FONT.black, fontSize: 24,
  color: COLOR.magenta, isTextBox: true, objectName: "Headroom value",
});
slide.addText(
  [
    { text: "more per order outside Beverage", options: { fontFace: FONT.bold, breakLine: true } },
    { text: "at top quartile. The plan needs half.", options: { fontFace: FONT.book } },
  ],
  {
    x: PX + 1.3, y: calloutY + 0.02, w: PW - 1.5, h: 0.56, margin: 0, valign: "middle", fontSize: 10, color: COLOR.ink,
    isTextBox: true, objectName: "Headroom text",
  },
);

slide.addText(
  `Today: all orders May–Oct 2026, scaled to $${PLAN[0].aov.toLocaleString("en-US", { minimumFractionDigits: 2 })}; ` +
    `${SKUS ? "SKUs = distinct SKUs a store buys in a year (Nov '25–Oct '26, stores with 12+ orders), grown with each department's $" : "cases at today's $ per case"}. ` +
    `Top quartile: 75th-percentile store (6+ orders) by share of orders that include the department. ` +
    `Plan closes 25% of that gap by Apr '27 and 50% by Oct '27, at today's ticket outside Beverage; Tobacco flat; Beverage fills the rest of the dollars.`,
  {
    x: X0, y: 6.86, w: 12.65 - X0, h: 0.55, margin: 0, valign: "top", fontFace: FONT.book, fontSize: 10, color: COLOR.muted,
    isTextBox: true, objectName: "Footnote",
  },
);

const bevOct = shown.oct.Beverage - shown.today.Beverage;
slide.addNotes(
  [
    `Our average order today is ${money(PLAN[0].aov)}. The plan takes it to ${money(PLAN[1].aov)} by April and ${money(PLAN[2].aov)} by next October, about 15% higher.`,
    `Over the last year the basket grew about ${money(aovChange)}, and Beverage was ${money(bevChange)} of that. ` +
      `Beverage is ${pct(shown.today.Beverage / Math.round(PLAN[0].aov))} of the order today, so it will keep doing a lot of the work: ` +
      `about +${money(bevOct)} in this plan, far less than it added this year. But Beverage is already in ` +
      `${pct(share("Beverage").today)} of orders, against ${pct(share("Beverage").top)} at our top-quartile stores, so it can no longer grow by ` +
      `showing up in more orders. It is no longer the main lever; what is left there is bigger beverage tickets.`,
    `The real room is in the rest of the store. Only about a third of orders include Grocery, and only a fifth to a quarter include Cleaning, Household, or Health & Beauty. ` +
      `Our top-quartile stores already buy these far more often. If every store bought like them, at today's ticket sizes, the order would be ${money(totalHeadroom)} bigger.`,
    `The plan needs half of that by October: cross-department spend goes from ${money(crossToday)} to ${money(crossOct)} per order, ` +
      `with Candy & Snacks the biggest piece and Grocery and Cleaning next. That is what the catalog, store-level gaps, M Rewards and Concierge recommendations are pointed at.`,
    (SKUS
      ? `A regular store buys about ${fmtUnits(totalUnits("today"))} different SKUs from us a year; the plan takes that to about ` +
        `${fmtUnits(totalUnits("apr"))} by April and ${fmtUnits(totalUnits("oct"))} by October. Beverage is ${fmtUnits(units("today", "Beverage"))} ` +
        `of today's SKUs; the rest of the store adds ${fmtUnits(crossDepts.reduce((s, d) => s + units("oct", d) - units("today", d), 0))} SKUs a year by October. `
      : `In cases, the order goes from about ${Math.round(totalUnits("today"))} to ${Math.round(totalUnits("apr"))} to ${Math.round(totalUnits("oct"))} cases. ` +
        `Beverage is ${fmtUnits(units("today", "Beverage"))} of today's cases; the rest of the store adds ` +
        `${fmtUnits(crossDepts.reduce((s, d) => s + units("oct", d) - units("today", d), 0))} cases per order by October. `) +
      `In eaches, today's order is about ${Math.round(DEPARTMENTS.reduce((s, d) => s + eachesPerOrder[d], 0) * scale)} units ` +
      `(Beverage about ${Math.round(eachesPerOrder.Beverage * scale)}, Candy & Snacks about ${Math.round(eachesPerOrder["Candy & Snacks"] * scale)}).`,
    `Method: department mix from all orders May–Oct 2026, scaled to ${money(PLAN[0].aov)}. Headroom per department = ` +
      `(top-quartile store's order share − average order share) × average department ticket, for stores with 6+ orders. ` +
      `25% of that gap closed by Apr '27, 50% by Oct '27; Tobacco flat; Beverage fills the remainder of the plan. ` +
      (SKUS
        ? `SKUs per store per year = distinct SKUs bought in the last twelve months by stores with 12+ orders, grown in line with ` +
          `each department's dollars, so they assume spend per SKU holds; the extra breadth is what the catalog and recommendations push.`
        : `Cases per order = department dollars ÷ today's dollars per case in that department, so the case counts assume prices and pack sizes hold.`),
  ].join("\n\n"),
);

mkdirSync(join(ROOT, "dist/slides"), { recursive: true });
await pres.writeFile({ fileName: OUT });
console.log(`wrote ${OUT}`);
