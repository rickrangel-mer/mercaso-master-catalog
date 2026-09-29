"use client";

import { hierarchy, tree as d3tree, type HierarchyPointNode } from "d3-hierarchy";
import { select } from "d3-selection";
import { linkHorizontal } from "d3-shape";
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { useEffect, useMemo, useRef, useState } from "react";
import { isLeaf, isLink, type CatalogIndex, type ViewNode, type VisibleNode } from "../lib/tree";

const ROW = 24;
const COL = 250;

interface Props {
  tree: VisibleNode;
  index: CatalogIndex;
  selectedId: string | null;
  hits: Set<string>;
  focus: { id: string; seq: number };
  onNodeClick: (node: ViewNode) => void;
}

type PointNode = HierarchyPointNode<VisibleNode>;

export function TreeView({ tree, index, selectedId, hits, focus, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);

  const layout = useMemo(() => {
    const root = hierarchy(tree, (d) => d.children);
    return d3tree<VisibleNode>().nodeSize([ROW, COL])(root);
  }, [tree]);

  const nodes = layout.descendants();
  const links = layout.links();
  const path = linkHorizontal<{ source: PointNode; target: PointNode }, PointNode>()
    .x((d) => d.y)
    .y((d) => d.x);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 2.5])
      .on("zoom", (e: { transform: ZoomTransform }) => setTransform(e.transform));
    select(svg).call(z).on("dblclick.zoom", null);
    // Phones start zoomed out so department names fit.
    if (svg.getBoundingClientRect().width < 600) select(svg).call(z.transform, zoomIdentity.scale(0.7));
    zoomRef.current = z;
    return () => {
      select(svg).on(".zoom", null);
    };
  }, []);

  // Bring the focused node to the left third of the view, keeping the current zoom level.
  useEffect(() => {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z) return;
    const target = nodes.find((n) => n.data.view.id === focus.id) ?? nodes[0];
    if (!target) return;
    const { width, height } = svg.getBoundingClientRect();
    const k = zoomTransform(svg).k;
    const left = width < 600 ? 24 : width * 0.3;
    const t = zoomIdentity.translate(left - target.y * k, height / 2 - target.x * k).scale(k);
    select(svg).call(z.transform, t);
    // Only re-center when a new focus is requested.
  }, [focus.seq]);

  return (
    <svg ref={svgRef} className="tree" role="tree" aria-label={`${index.catalog.name} catalog`}>
      <g transform={transform.toString()}>
        <g className="links">
          {links.map((l) => (
            <path
              key={`${l.source.data.view.id}>${l.target.data.view.id}`}
              d={path(l) ?? undefined}
              className={isLink(l.target.data.view) ? "edge edge-link" : "edge"}
            />
          ))}
        </g>
        <g className="nodes">
          {nodes.map((n) => (
            <TreeNode
              key={n.data.view.id}
              point={n}
              index={index}
              selected={n.data.view.id === selectedId}
              hit={hits.has(n.data.view.id)}
              onClick={onNodeClick}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}

function TreeNode({
  point,
  index,
  selected,
  hit,
  onClick,
}: {
  point: PointNode;
  index: CatalogIndex;
  selected: boolean;
  hit: boolean;
  onClick: (node: ViewNode) => void;
}) {
  const { view, hidden } = point.data;
  const d = view.data;
  const leaf = isLeaf(view);
  const link = isLink(view);
  const priority = d?.priority;
  const status = d?.match?.status;
  const count = !leaf && hidden > 0 ? index.rollup.get(view.id)?.leaves : undefined;
  const expanded = !leaf && !link && view.children.length > 0 ? hidden === 0 : undefined;

  const classes = ["node", `kind-${view.kind}`, priority ? `p-${priority}` : "", selected ? "selected" : "", hit ? "hit" : "", link ? "link" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <g
      className={classes}
      transform={`translate(${point.y},${point.x})`}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={expanded}
      tabIndex={0}
      onClick={() => onClick(view)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(view);
        }
      }}
    >
      <title>{view.id === "__store__" ? view.name : view.id}</title>
      {leaf && status && status !== "gap" && (
        <circle className={`status-ring status-${status}`} r={view.kind === "assortment_slot" ? 9 : 8} />
      )}
      {view.kind === "assortment_slot" ? (
        <rect className="shape" x={-5} y={-5} width={10} height={10} rx={2} />
      ) : (
        <circle className={`shape${hidden > 0 ? " collapsed" : ""}`} r={leaf ? 4.5 : 5.5} />
      )}
      <text className="label" x={10} dy="0.32em">
        {link ? `↗ ${view.name}` : view.name}
        {count !== undefined && <tspan className="count"> {count}</tspan>}
      </text>
    </g>
  );
}
