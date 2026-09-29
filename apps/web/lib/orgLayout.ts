// Top-down org-chart layout, in the style of an HR org diagram.
// - Closed children sit in a compact two-column grid hung off a vertical spine.
// - Each open child gets its own subtree to the right of that grid, joined by a horizontal bus.
// Pure geometry: no React, no DOM. Coordinates are card top-left corners in canvas pixels.
import type { VisibleNode } from "./tree.ts";

export const CARD_W = 236;
export const CARD_H = 104;
/** Vertical gap between a parent card and its first row of children. */
export const GAP_Y = 44;
/** Vertical gap between grid rows. */
export const ROW_GAP = 16;
/** Horizontal gap between the two grid columns; the spine runs down its middle. */
export const SPINE_GAP = 36;
/** Horizontal gap between sibling subtrees in row mode. */
export const GROUP_GAP = 40;

export interface PlacedCard {
  node: VisibleNode;
  x: number;
  y: number;
}

/** A straight connector segment. */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface OrgLayout {
  cards: PlacedCard[];
  segments: Segment[];
  width: number;
  height: number;
  byId: Map<string, PlacedCard>;
}

interface Box {
  w: number;
  h: number;
  /** x of this subtree's root card inside the box. */
  cardX: number;
  cards: PlacedCard[];
  segments: Segment[];
}

const shift = (b: Box, dx: number, dy: number): Box => ({
  ...b,
  cards: b.cards.map((c) => ({ ...c, x: c.x + dx, y: c.y + dy })),
  segments: b.segments.map((s) => ({ x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy })),
});

/**
 * Closed siblings as a block: one card, or a two-column grid hung off a vertical spine.
 * `attach` is where the connector from the parent comes in (card center or spine).
 */
function gridBlock(kids: VisibleNode[]): Box & { attach: number } {
  if (kids.length === 1) {
    return { w: CARD_W, h: CARD_H, cardX: 0, attach: CARD_W / 2, cards: [{ node: kids[0]!, x: 0, y: 0 }], segments: [] };
  }
  const spineX = CARD_W + SPINE_GAP / 2;
  const rows = Math.ceil(kids.length / 2);
  const cards: PlacedCard[] = [];
  const segments: Segment[] = [];
  kids.forEach((kid, i) => {
    const col = i % 2;
    const y = Math.floor(i / 2) * (CARD_H + ROW_GAP);
    const x = col === 0 ? 0 : CARD_W + SPINE_GAP;
    cards.push({ node: kid, x, y });
    const midY = y + CARD_H / 2;
    segments.push(col === 0 ? { x1: CARD_W, y1: midY, x2: spineX, y2: midY } : { x1: spineX, y1: midY, x2: x, y2: midY });
  });
  segments.push({ x1: spineX, y1: 0, x2: spineX, y2: (rows - 1) * (CARD_H + ROW_GAP) + CARD_H / 2 });
  return { w: CARD_W * 2 + SPINE_GAP, h: rows * (CARD_H + ROW_GAP) - ROW_GAP, cardX: 0, attach: spineX, cards, segments };
}

function layoutBox(n: VisibleNode): Box {
  const kids = n.children;
  if (kids.length === 0) {
    return { w: CARD_W, h: CARD_H, cardX: 0, cards: [{ node: n, x: 0, y: 0 }], segments: [] };
  }

  // Closed children share one compact grid block; each open child gets its own subtree beside it.
  const closed = kids.filter((k) => k.children.length === 0);
  const open = kids.filter((k) => k.children.length > 0);
  const blocks: (Box & { attach: number })[] = [];
  if (closed.length > 0) blocks.push(gridBlock(closed));
  for (const k of open) {
    const b = layoutBox(k);
    blocks.push({ ...b, attach: b.cardX + CARD_W / 2 });
  }

  const top = CARD_H + GAP_Y;
  let x = 0;
  const attaches: number[] = [];
  const placed: Box[] = [];
  for (const b of blocks) {
    placed.push(shift(b, x, top));
    attaches.push(x + b.attach);
    x += b.w + GROUP_GAP;
  }
  const blocksW = x - GROUP_GAP;
  const first = attaches[0]!;
  const last = attaches[attaches.length - 1]!;
  let parentX = (first + last) / 2 - CARD_W / 2;
  let offset = 0;
  if (parentX < 0) {
    offset = -parentX;
    parentX = 0;
  }
  const parentCenter = parentX + CARD_W / 2;
  const busY = CARD_H + GAP_Y / 2;
  const segments: Segment[] =
    blocks.length === 1
      ? [{ x1: parentCenter, y1: CARD_H, x2: parentCenter, y2: top }]
      : [
          { x1: parentCenter, y1: CARD_H, x2: parentCenter, y2: busY },
          { x1: first + offset, y1: busY, x2: last + offset, y2: busY },
          ...attaches.map((a) => ({ x1: a + offset, y1: busY, x2: a + offset, y2: top })),
        ];
  const cards: PlacedCard[] = [{ node: n, x: parentX, y: 0 }];
  for (const b of placed) {
    const s = shift(b, offset, 0);
    cards.push(...s.cards);
    segments.push(...s.segments);
  }
  return {
    w: Math.max(blocksW + offset, parentX + CARD_W),
    h: top + Math.max(...blocks.map((b) => b.h)),
    cardX: parentX,
    cards,
    segments,
  };
}

export function layoutOrgChart(root: VisibleNode): OrgLayout {
  const box = layoutBox(root);
  return {
    cards: box.cards,
    segments: box.segments,
    width: box.w,
    height: box.h,
    byId: new Map(box.cards.map((c) => [c.node.view.id, c])),
  };
}
