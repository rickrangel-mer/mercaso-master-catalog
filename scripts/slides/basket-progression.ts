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
const OUT = join(ROOT, "dist/slides/basket-progression.pptx");

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
const perOrder = Object.fromEntries(DEPARTMENTS.map((d) => [d, 0])) as Record<Dept, number>;
for (const r of mixRows) {
  const name = r.department ?? "";
  const d = (DEPARTMENTS as readonly string[]).includes(name) ? (name as Dept) : "Other";
  perOrder[d] += Number(r.per_order);
}
const measuredAov = DEPARTMENTS.reduce((s, d) => s + perOrder[d], 0);
const scale = PLAN[0].aov / measuredAov;

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
const crossToday = crossDepts.reduce((s, d) => s + shown.today[d], 0);
const crossOct = crossDepts.reduce((s, d) => s + shown.oct[d], 0);

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
  })),
);
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
const CARD_W = 1.55;
const GAP = 0.12;
const cardX = (i: number) => X0 + LABEL_W + i * (CARD_W + GAP);
const DELTA_X = cardX(3);
const DELTA_W = 0.95;
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
  slide.addText(i === 0 ? "avg. order" : `+${money(growth)} · +${Math.round((growth / PLAN[0].aov) * 100)}%`, {
    x, y: TOP + 0.98, w: CARD_W, h: 0.24, margin: 0, align: "center", valign: "middle", fontFace: FONT.bold, fontSize: 11,
    color: dark ? COLOR.white : i === 1 ? COLOR.magenta : COLOR.muted, isTextBox: true, objectName: `${p.sub} growth`,
  });

  DEPARTMENTS.forEach((d, r) => {
    const v = shown[p.key][d];
    slide.addText(
      [
        { text: money(v), options: { fontFace: FONT.bold, fontSize: 14, color: fg } },
        { text: `  ${pct(v / Math.round(p.aov))}`, options: { fontFace: FONT.book, fontSize: 10, color: sub } },
      ],
      { x, y: ROW_Y0 + r * ROW_H, w: CARD_W, h: ROW_H, margin: 0, align: "center", valign: "middle", isTextBox: true,
        objectName: `${p.sub} ${d}` },
    );
  });
});

slide.addText(
  [
    { text: "DEPARTMENT", options: { fontFace: FONT.bold, charSpacing: 1, breakLine: true } },
    { text: "$ per order · mix", options: { fontFace: FONT.book } },
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
const PX = TABLE_RIGHT + 0.4;
const PW = 12.65 - PX;
slide.addShape(pres.ShapeType.roundRect, {
  x: PX, y: TOP, w: PW, h: BOTTOM - TOP, rectRadius: 0.12, fill: { color: COLOR.panel }, line: { color: "EFE9F5", width: 0.75 },
  shadow: { type: "outer", color: "5C2E91", opacity: 0.08, blur: 8, offset: 2, angle: 90 },
  objectName: "Room to grow panel",
});
slide.addText("Room to grow", {
  x: PX + 0.25, y: TOP + 0.18, w: PW - 0.5, h: 0.4, margin: 0, fontFace: FONT.black, fontSize: 18, color: COLOR.purple,
  isTextBox: true, objectName: "Panel title",
});
slide.addText("% of orders with the department", {
  x: PX + 0.25, y: TOP + 0.58, w: PW - 0.5, h: 0.26, margin: 0, fontFace: FONT.book, fontSize: 11, color: COLOR.muted,
  isTextBox: true, objectName: "Panel subtitle",
});

const chartDepts = [...crossDepts].sort((a, b) => headroom[b] - headroom[a]);
const shortLabel: Record<string, string> = { "Cleaning & Laundry": "Cleaning", "Household & Kitchen": "Household", "Health & Beauty": "Health & Beauty", Other: "All other" };
const chartLabels = chartDepts.map((d) => shortLabel[d] ?? d);
// Bar charts draw the first category at the bottom; reverse so the biggest gap sits on top.
slide.addChart(
  pres.ChartType.bar,
  [
    { name: "Typical order", labels: [...chartLabels].reverse(), values: chartDepts.map((d) => Number(head[d].share_avg)).reverse() },
    { name: "Top-quartile stores", labels: [...chartLabels].reverse(), values: chartDepts.map((d) => Number(head[d].share_p75)).reverse() },
  ],
  {
    x: PX + 0.1, y: TOP + 0.88, w: PW - 0.25, h: 2.75, barDir: "bar", barGrouping: "clustered", barGapWidthPct: 45,
    chartColors: [COLOR.barBase, COLOR.magenta],
    showLegend: true, legendPos: "t", legendFontFace: FONT.book, legendFontSize: 10, legendColor: COLOR.ink,
    showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0%", dataLabelFontFace: FONT.bold, dataLabelFontSize: 9,
    dataLabelColor: COLOR.ink,
    catAxisLabelFontFace: FONT.book, catAxisLabelFontSize: 10, catAxisLabelColor: COLOR.ink, catAxisLineShow: false,
    valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: 1.15, valGridLine: { style: "none" }, catGridLine: { style: "none" },
    objectName: "Room to grow chart",
  },
);

const calloutY = TOP + 3.72;
slide.addShape(pres.ShapeType.roundRect, {
  x: PX + 0.2, y: calloutY, w: PW - 0.4, h: BOTTOM - calloutY - 0.2, rectRadius: 0.08, fill: { color: COLOR.white },
  line: { type: "none" }, objectName: "Headroom callout",
});
slide.addText(money(totalHeadroom), {
  x: PX + 0.35, y: calloutY + 0.08, w: 1.3, h: 0.7, margin: 0, valign: "middle", fontFace: FONT.black, fontSize: 28,
  color: COLOR.magenta, isTextBox: true, objectName: "Headroom value",
});
slide.addText(
  [
    { text: "more per order", options: { fontFace: FONT.bold, breakLine: true } },
    { text: "if every store bought like the top quartile. The plan needs half.", options: { fontFace: FONT.book } },
  ],
  {
    x: PX + 1.6, y: calloutY + 0.06, w: PW - 1.95, h: 0.74, margin: 0, valign: "middle", fontSize: 10.5, color: COLOR.ink,
    isTextBox: true, objectName: "Headroom text",
  },
);

slide.addText(
  `Today: all orders May–Oct 2026, mix scaled to $${PLAN[0].aov.toLocaleString("en-US", { minimumFractionDigits: 2 })}. Top quartile: 75th-percentile store, stores with 6+ orders. ` +
    `Plan closes 25% of that gap by Apr '27 and 50% by Oct '27 at today's ticket; Tobacco flat; Beverage fills the rest.`,
  {
    x: X0, y: 6.88, w: 12.65 - X0, h: 0.4, margin: 0, valign: "top", fontFace: FONT.book, fontSize: 10, color: COLOR.muted,
    isTextBox: true, objectName: "Footnote",
  },
);

const bevOct = shown.oct.Beverage - shown.today.Beverage;
slide.addNotes(
  [
    `Our average order today is ${money(PLAN[0].aov)}. The plan takes it to ${money(PLAN[1].aov)} by April and ${money(PLAN[2].aov)} by next October, about 15% higher.`,
    `Over the last year the basket grew about ${money(aovChange)}, and Beverage was ${money(bevChange)} of that. ` +
      `Beverage is ${pct(shown.today.Beverage / Math.round(PLAN[0].aov))} of the order today, so it will keep doing a lot of the work: ` +
      `about +${money(bevOct)} in this plan, far less than it added this year.`,
    `The real room is in the rest of the store. Only about a third of orders include Grocery, and only a fifth to a quarter include Cleaning, Household, or Health & Beauty. ` +
      `Our top-quartile stores already buy these far more often. If every store bought like them, at today's ticket sizes, the order would be ${money(totalHeadroom)} bigger.`,
    `The plan needs half of that by October: cross-department spend goes from ${money(crossToday)} to ${money(crossOct)} per order, ` +
      `with Candy & Snacks the biggest piece and Grocery and Cleaning next. That is what the catalog, store-level gaps, M Rewards and Concierge recommendations are pointed at.`,
    `Method: department mix from all orders May–Oct 2026, scaled to ${money(PLAN[0].aov)}. Headroom per department = ` +
      `(top-quartile store's order share − average order share) × average department ticket, for stores with 6+ orders. ` +
      `25% of that gap closed by Apr '27, 50% by Oct '27; Tobacco flat; Beverage fills the remainder of the plan.`,
  ].join("\n\n"),
);

mkdirSync(join(ROOT, "dist/slides"), { recursive: true });
await pres.writeFile({ fileName: OUT });
console.log(`wrote ${OUT}`);
