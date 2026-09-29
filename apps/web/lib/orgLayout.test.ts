import { describe, expect, it } from "vitest";
import { CARD_H, CARD_W, GAP_Y, GROUP_GAP, layoutOrgChart, ROW_GAP, SPINE_GAP } from "./orgLayout.ts";
import type { VisibleNode } from "./tree.ts";

const node = (id: string, children: VisibleNode[] = [], hidden = 0): VisibleNode => ({
  view: { id, name: id, kind: "category", children: [] },
  children,
  hidden,
});

const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  a.x < b.x + CARD_W && b.x < a.x + CARD_W && a.y < b.y + CARD_H && b.y < a.y + CARD_H;

describe("layoutOrgChart", () => {
  it("places closed children in a two-column grid under the parent", () => {
    const l = layoutOrgChart(node("root", [node("a"), node("b"), node("c")]));
    const pos = (id: string) => l.byId.get(id)!;
    expect(l.width).toBe(CARD_W * 2 + SPINE_GAP);
    expect(pos("root")).toMatchObject({ x: (l.width - CARD_W) / 2, y: 0 });
    expect(pos("a")).toMatchObject({ x: 0, y: CARD_H + GAP_Y });
    expect(pos("b")).toMatchObject({ x: CARD_W + SPINE_GAP, y: CARD_H + GAP_Y });
    expect(pos("c")).toMatchObject({ x: 0, y: CARD_H + GAP_Y + CARD_H + ROW_GAP });
  });

  it("stacks a single child straight below", () => {
    const l = layoutOrgChart(node("root", [node("a")]));
    expect(l.byId.get("a")).toMatchObject({ x: 0, y: CARD_H + GAP_Y });
    expect(l.segments).toHaveLength(1);
  });

  it("keeps closed siblings in the grid and puts open ones beside it, parent centered", () => {
    const l = layoutOrgChart(node("root", [node("a", [node("a1"), node("a2")]), node("b"), node("c", [node("c1")]), node("d")]));
    const pos = (id: string) => l.byId.get(id)!;
    // Closed b and d form the grid block on the left, side by side.
    expect(pos("b")).toMatchObject({ x: 0, y: CARD_H + GAP_Y });
    expect(pos("d")).toMatchObject({ x: CARD_W + SPINE_GAP, y: CARD_H + GAP_Y });
    // Open a and c follow as their own subtrees, on the same row.
    expect(pos("a").y).toBe(CARD_H + GAP_Y);
    expect(pos("a").x).toBeGreaterThanOrEqual(CARD_W * 2 + SPINE_GAP + GROUP_GAP);
    expect(pos("c").x).toBeGreaterThan(pos("a").x);
    // Parent sits between the grid spine and the last open child.
    const spine = CARD_W + SPINE_GAP / 2;
    expect(pos("root").x + CARD_W / 2).toBeCloseTo((spine + pos("c").x + CARD_W / 2) / 2);
  });

  it("never overlaps cards", () => {
    const deep = node("root", [
      node("a", [node("a1", [node("x"), node("y"), node("z")]), node("a2")]),
      node("b"),
      node("c", [node("c1"), node("c2"), node("c3"), node("c4"), node("c5")]),
    ]);
    const cards = layoutOrgChart(deep).cards;
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        expect(overlaps(cards[i]!, cards[j]!), `${cards[i]!.node.view.id} vs ${cards[j]!.node.view.id}`).toBe(false);
      }
    }
    expect(Math.min(...cards.map((c) => c.x))).toBeGreaterThanOrEqual(0);
  });
});
