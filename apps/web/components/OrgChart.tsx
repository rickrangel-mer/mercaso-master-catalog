"use client";

import { select } from "d3-selection";
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CARD_H, CARD_W, layoutOrgChart, type PlacedCard } from "../lib/orgLayout";
import { isLeaf, isLink, ROOT_ID, type CatalogIndex, type ViewNode, type VisibleNode } from "../lib/tree";

interface Props {
  tree: VisibleNode;
  index: CatalogIndex;
  selectedId: string | null;
  hits: Set<string>;
  /** Center this node near the top of the view (initial load, search, jump). */
  focus: { id: string; seq: number };
  /** Keep this node where it is on screen while the layout around it changes (open/close). */
  anchor: { id: string; seq: number };
  onSelect: (node: ViewNode) => void;
  onToggle: (node: ViewNode) => void;
}

const TOP_PAD = 32;
const MIN_K = 0.1;
const MAX_K = 2;

const SHORT_KIND: Record<ViewNode["kind"], string> = {
  store_type: "Store type",
  department: "Department",
  category: "Category",
  subcategory: "Subcategory",
  brand_line: "Brand line",
  variant: "Variant",
  size: "Size",
  assortment_slot: "Assortment slot",
};

export function OrgChart({ tree, index, selectedId, hits, focus, anchor, onSelect, onToggle }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const layout = useMemo(() => layoutOrgChart(tree), [tree]);

  // Department of every node, for the tint and the tag.
  const deptOf = useMemo(() => {
    const m = new Map<string, { name: string; slot: number }>();
    index.root.children.forEach((d, i) => {
      const rec = (n: ViewNode) => {
        m.set(n.id, { name: d.name, slot: i < 8 ? i + 1 : 0 });
        n.children.forEach(rec);
      };
      rec(d);
    });
    return m;
  }, [index]);

  // Zoom and pan: drag pans, wheel pans, ctrl/pinch-wheel zooms.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const z = zoom<HTMLDivElement, unknown>()
      .scaleExtent([MIN_K, MAX_K])
      .filter((e: Event) => (e.type === "wheel" ? (e as WheelEvent).ctrlKey : !(e as MouseEvent).button))
      .on("zoom", (e: { transform: ZoomTransform }) => setTransform(e.transform));
    const sel = select(el);
    sel.call(z).on("dblclick.zoom", null);
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      const k = zoomTransform(el).k;
      z.translateBy(sel, -e.deltaX / k, -e.deltaY / k);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    if (el.clientWidth < 600) sel.call(z.transform, zoomIdentity.scale(0.7));
    zoomRef.current = z;
    return () => {
      el.removeEventListener("wheel", onWheel);
      sel.on(".zoom", null);
    };
  }, []);

  const apply = useCallback((t: ZoomTransform) => {
    const el = viewportRef.current;
    if (el && zoomRef.current) select(el).call(zoomRef.current.transform, t);
  }, []);

  // Put a card at the horizontal center: the root at the top, anything else a third of the way
  // down so its parent stays in view. Zoomed far out, come back to a readable scale.
  const centerOn = useCallback(
    (card: PlacedCard | undefined) => {
      const el = viewportRef.current;
      if (!el || !card) return;
      const current = zoomTransform(el).k;
      const k = current < 0.6 ? (el.clientWidth < 600 ? 0.7 : 1) : current;
      const y = card.node.view.id === ROOT_ID ? TOP_PAD : el.clientHeight * 0.33 - (CARD_H / 2) * k;
      apply(zoomIdentity.translate(el.clientWidth / 2 - (card.x + CARD_W / 2) * k, y - card.y * k).scale(k));
    },
    [apply],
  );

  useEffect(() => {
    centerOn(layout.byId.get(focus.id) ?? layout.byId.get(ROOT_ID));
    // Only when a new focus is requested; the layout of that same render is the one to use.
  }, [focus.seq]);

  // Keep the toggled card fixed on screen: shift the view by however far the card moved.
  const prevPositions = useRef<Map<string, PlacedCard>>(new Map());
  const handledAnchor = useRef(anchor.seq);
  useEffect(() => {
    if (anchor.seq !== handledAnchor.current) {
      handledAnchor.current = anchor.seq;
      const before = prevPositions.current.get(anchor.id);
      const after = layout.byId.get(anchor.id);
      const el = viewportRef.current;
      if (before && after && el) apply(zoomTransform(el).translate(before.x - after.x, before.y - after.y));
    }
    prevPositions.current = layout.byId;
  }, [layout, anchor.seq, anchor.id, apply]);

  const zoomBy = (factor: number) => {
    const el = viewportRef.current;
    if (el && zoomRef.current) select(el).call(zoomRef.current.scaleBy, factor);
  };

  const fit = () => {
    const el = viewportRef.current;
    if (!el) return;
    const pad = 48;
    const k = Math.max(MIN_K, Math.min(1, (el.clientWidth - pad) / layout.width, (el.clientHeight - pad) / layout.height));
    apply(zoomIdentity.translate((el.clientWidth - layout.width * k) / 2, Math.max(pad / 2, (el.clientHeight - layout.height * k) / 2)).scale(k));
  };

  const locate = () => centerOn(layout.byId.get(selectedId ?? ROOT_ID) ?? layout.byId.get(ROOT_ID));

  const linesPath = useMemo(
    () => layout.segments.map((s) => `M${s.x1},${s.y1}L${s.x2},${s.y2}`).join(""),
    [layout],
  );

  return (
    <div className="org">
      <div ref={viewportRef} className="org-viewport" role="tree" aria-label={`${index.catalog.name} catalog`}>
        <div
          className="org-canvas"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}
        >
          <svg className="org-lines" width={layout.width} height={layout.height} aria-hidden="true">
            <path key={`${layout.width}x${layout.height}:${layout.cards.length}`} d={linesPath} />
          </svg>
          {layout.cards.map((c) => (
            <Card
              key={c.node.view.id}
              card={c}
              index={index}
              dept={deptOf.get(c.node.view.id)}
              selected={c.node.view.id === selectedId}
              hit={hits.has(c.node.view.id)}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      </div>
      <div className="org-rail" role="toolbar" aria-label="View controls">
        <RailButton label="Zoom in" onClick={() => zoomBy(1.25)} icon={<><circle cx="10" cy="10" r="6" /><path d="M10 7v6M7 10h6M15 15l4 4" /></>} />
        <RailButton label="Zoom out" onClick={() => zoomBy(0.8)} icon={<><circle cx="10" cy="10" r="6" /><path d="M7 10h6M15 15l4 4" /></>} />
        <RailButton label="Fit to screen" onClick={fit} icon={<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />} />
        <RailButton label="Center on selection" onClick={locate} icon={<><circle cx="12" cy="11" r="3" /><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" /></>} />
      </div>
    </div>
  );
}

function RailButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: ReactNode }) {
  return (
    <button type="button" className="rail-button" aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        {icon}
      </svg>
    </button>
  );
}

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "·";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

function metaLine(view: ViewNode, index: CatalogIndex): string {
  const d = view.data;
  const a = d?.attrs;
  const roll = index.rollup.get(view.id);
  if (view.kind === "store_type") {
    return `${view.children.length} departments · ${roll?.leaves ?? 0} leaves`;
  }
  if (isLink(view)) {
    const targets = (a?.cross_ref ?? []).map((id) => index.byId.get(id)?.name ?? id);
    return `Points to ${targets.join(", ")}`;
  }
  if (view.kind === "size") {
    return [a?.size_class, a?.container, a?.volume_ml !== undefined ? `${a.volume_ml} ml` : undefined, a?.unit_count ? `${a.unit_count} ct` : undefined]
      .filter(Boolean)
      .join(" · ");
  }
  if (view.kind === "assortment_slot") {
    const t = a?.target_count;
    const target = t ? `Target ${t.min === t.max ? t.min : `${t.min}–${t.max}`}` : "";
    return [target, a?.mix?.join(", "), a?.brand_hints?.slice(0, 3).join(", ")].filter(Boolean).join(" · ");
  }
  if (!roll) return "";
  return `${roll.must} must · ${roll.should} should · ${roll.nice} nice`;
}

const Card = memo(function Card({
  card,
  index,
  dept,
  selected,
  hit,
  onSelect,
  onToggle,
}: {
  card: PlacedCard;
  index: CatalogIndex;
  dept: { name: string; slot: number } | undefined;
  selected: boolean;
  hit: boolean;
  onSelect: (node: ViewNode) => void;
  onToggle: (node: ViewNode) => void;
}) {
  const { view, hidden } = card.node;
  const d = view.data;
  const leaf = isLeaf(view);
  const link = isLink(view);
  const canToggle = !leaf && !link && view.children.length > 0 && view.id !== ROOT_ID;
  const open = canToggle && hidden === 0;
  const roll = index.rollup.get(view.id);
  const match = d?.match;
  // Only leaves show a priority tag; on a branch it is just the default its leaves inherit.
  const showPriority = leaf && d?.priority;

  const classes = ["org-card", `kind-${view.kind}`, selected && "selected", hit && "hit", link && "link"]
    .filter(Boolean)
    .join(" ");
  const style = {
    transform: `translate(${card.x}px, ${card.y}px)`,
    width: CARD_W,
    height: CARD_H,
    "--tint": dept && dept.slot > 0 ? `var(--cat-${dept.slot})` : "var(--neutral-tint)",
  } as CSSProperties;

  return (
    <div
      className={classes}
      style={style}
      role="treeitem"
      aria-label={view.name}
      aria-selected={selected}
      aria-expanded={canToggle ? open : undefined}
      tabIndex={0}
      onClick={() => onSelect(view)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect(view);
        if (e.key === " " && canToggle) {
          e.preventDefault();
          onToggle(view);
        }
      }}
    >
      <div className="card-head">
        <span className="avatar" aria-hidden="true">
          {view.kind === "store_type" ? "⌂" : initials(view.name)}
        </span>
        <div className="card-title">
          <div className="card-name" title={view.name}>
            {link ? "↗ " : ""}
            {view.name}
          </div>
          <div className="card-kind">{SHORT_KIND[view.kind]}</div>
        </div>
      </div>
      <div className="card-meta" title={metaLine(view, index)}>
        {metaLine(view, index)}
      </div>
      <div className="card-foot">
        {dept && view.kind !== "department" && (
          <span className="tag dept-tag" title={dept.name}>
            {dept.name}
          </span>
        )}
        {showPriority && <span className={`tag prio prio-${d!.priority}`}>{d!.priority}</span>}
        {d?.attrs.verify && (
          <span className="tag flag" title={d.attrs.verify === "sales" ? "Needs the sales cross-check" : "Needs a stock check"}>
            check
          </span>
        )}
        <span className="foot-spacer" />
        {leaf && match ? (
          <span className={`match match-${match.status}`} title={`${match.approved} approved, ${match.pending} pending`}>
            {match.status}
          </span>
        ) : (
          !link &&
          roll && (
            <span className="count" title={`${view.children.length} direct · ${roll.leaves} leaves below`}>
              {view.children.length}|{roll.leaves}
            </span>
          )
        )}
      </div>
      {canToggle && (
        <button
          type="button"
          className="card-toggle"
          aria-label={`${open ? "Close" : "Open"} ${view.name}`}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(view);
          }}
        >
          {open ? "×" : "+"}
        </button>
      )}
    </div>
  );
});
