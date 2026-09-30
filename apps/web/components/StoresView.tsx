"use client";

import { useEffect, useMemo, useState } from "react";
import { BANDS, hasMoney, storeSummary, tierLabel, type StoreFile } from "../lib/stores";
import { ItemGaps } from "./ItemGaps";
import { StoreDetail } from "./StoreDetail";
import { fmt, pct } from "./format";
import { StoreTable } from "./StoreTable";

interface Props {
  file: StoreFile | null;
  onJumpItem: (id: string) => void;
}


export function StoresView({ file, onJumpItem }: Props) {
  const [view, setView] = useState<"stores" | "items">("stores");
  const [storeId, setStoreId] = useState<string | null>(null);
  const summary = useMemo(() => (file ? storeSummary(file) : null), [file]);
  const store = file && storeId ? (file.stores.find((s) => s.id === storeId) ?? null) : null;

  useEffect(() => {
    if (!store) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setStoreId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  if (!file || !summary) {
    return (
      <div className="stores-view">
        <p className="muted">
          Store data is not in this build. Run <code>pnpm athena:export liquor-stores liquor-store-skus</code> and <code>pnpm stores</code>, then build the site again.
        </p>
      </div>
    );
  }
  const holds = [...new Map(file.items.filter((i) => i.hold).map((i) => [i.hold!.reason, i])).values()];
  const heldCount = file.items.filter((i) => i.hold).length;
  const maxBand = Math.max(...summary.bands.map((b) => b.active + b.inactive), 1);

  return (
    <div className="stores-view">
      <div className="block-head">
        <h2>How much of the catalog each store buys from Mercaso</h2>
        <p className="muted">
          {fmt(summary.stores)} California liquor stores that ordered in the last 12 months, as of {file.as_of}. A store is active if it ordered in the last {file.active_days} days. A gap is a catalog item the store
          hasn&apos;t bought from us in 90 days; stores are compared with stores that order as often as they do.
        </p>
      </div>

      <section className="tiles" aria-label="Headline numbers">
        <div className="tile">
          <div className="tile-label">Active stores</div>
          <div className="tile-value">{fmt(summary.active)}</div>
          <div className="tile-sub muted">
            {fmt(summary.inactive)} inactive, a median {summary.inactiveMedianDays} days since their last order
          </div>
        </div>
        <div className="tile">
          <div className="tile-label">Must items an active store buys</div>
          <div className="tile-value">{pct(summary.medianMustActive)}</div>
          <div className="tile-sub muted">median, of {file.totals.must} must items</div>
        </div>
        <div className="tile">
          <div className="tile-label">Stores buying under 10% of must</div>
          <div className="tile-value">{fmt(summary.under10)}</div>
          <div className="tile-sub muted">active and inactive</div>
        </div>
        <div className="tile">
          <div className="tile-label">Active stores ordering less</div>
          <div className="tile-value">{fmt(summary.decliningActive)}</div>
          <div className="tile-sub muted">20%+ fewer orders than the 90 days before</div>
        </div>
      </section>

      <div className="two-col">
        <section className="card-block">
          <div className="block-head">
            <h3>Stores by must coverage</h3>
            <p className="muted">Share of the {file.totals.must} must items each store bought from Mercaso in 12 months.</p>
          </div>
          <div className="bars">
            {BANDS.map((label, b) => {
              const n = summary.bands[b]!;
              const total = n.active + n.inactive;
              return (
                <div key={label} className="bar-row" title={`${fmt(n.active)} active, ${fmt(n.inactive)} inactive`}>
                  <span className="bar-label">{label}</span>
                  <span className="bar-track" role="img" aria-label={`${label}: ${total} stores`}>
                    <span className="bar-fill" style={{ width: `${Math.max((total / maxBand) * 100, 1)}%` }} />
                  </span>
                  <span className="bar-value">
                    <strong>{fmt(total)}</strong> <span className="muted">{fmt(n.active)} active</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="card-block">
          <div className="block-head">
            <h3>Median must coverage by order frequency</h3>
            <p className="muted">Stores are compared with their own tier.</p>
          </div>
          <div className="bars">
            {file.tiers.map((_, t) => (
              <div key={t} className="bar-row">
                <span className="bar-label">{tierLabel(file, t)}</span>
                <span className="bar-track" role="img" aria-label={`${tierLabel(file, t)}: ${pct(summary.tierMedians[t] ?? 0)}`}>
                  <span className="bar-fill" style={{ width: `${Math.max((summary.tierMedians[t] ?? 0) * 100, 1)}%` }} />
                </span>
                <span className="bar-value">
                  <strong>{pct(summary.tierMedians[t] ?? 0)}</strong> <span className="muted">{fmt(summary.tierCounts[t] ?? 0)} stores</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {heldCount > 0 && (
        <p className="hold-note">
          <span className="tag hold-tag">supply hold</span> {heldCount} items are on supply hold ({holds.map((h) => `${h.hold!.reason.replace(/\.$/, "")}, since ${h.hold!.since}`).join("; ")}). They
          still count as bought, but not as gaps or opportunity.
        </p>
      )}

      <div className="segmented" role="tablist" aria-label="Store view">
        <button type="button" role="tab" aria-selected={view === "stores"} onClick={() => setView("stores")}>
          Stores
        </button>
        <button type="button" role="tab" aria-selected={view === "items"} onClick={() => setView("items")}>
          Items to push
        </button>
      </div>

      {view === "stores" ? <StoreTable file={file} onOpen={setStoreId} /> : <ItemGaps file={file} onOpenStore={setStoreId} onJumpItem={onJumpItem} />}
      {!hasMoney(file) && <p className="muted small">This build has no prices, so spend, price, margin and opportunity are hidden.</p>}

      {store && <StoreDetail file={file} store={store} onClose={() => setStoreId(null)} onJumpItem={onJumpItem} />}
    </div>
  );
}
