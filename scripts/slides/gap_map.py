"""
The market-gaps map for slide 3: one stretch of Central Long Beach at street level (OpenStreetMap),
with the stores we serve, the ones that churned, and the prospects, split by whether a rep has visited them.

    pnpm athena:export map-customers map-visits   # data/raw/map_customers.csv, map_visits.csv
    python3 scripts/slides/gap_map.py             # dist/slides/gap-map.png and gap-map.json
    pnpm slides:basket                            # places them on slide 3 and draws the markers

Inputs, all in the gitignored data/raw/:
  market_store_list.csv  Rick's market list: active, churned and prospect stores (deduplicated here)
  prospects.csv          Rick's prospect list; names never leave data/raw. If it carries coordinates
                         (lat/lng or latitude/longitude columns), prospects are placed from it
  map_customers.csv      coordinates of Mercaso stores (their address), for active and churned stores
  map_visits.csv         CRM store visits with the rep's GPS. Used for prospects only while the
                         prospect list has no coordinates: a store visited that has never ordered sits
                         at the median of its visits, spots where visits to 4+ different stores were
                         logged (a rep logging from one place) left out
  osm_tiles/             OpenStreetMap tiles, fetched once on first run and kept (needs
                         tile.openstreetmap.org allowed). Credit: (c) OpenStreetMap contributors.

Python packages: pandas, pillow.

The stretch was picked by scanning 2.6 x 1.6 km boxes over Long Beach for the best mix of stores we
serve and stores left (churned + prospects): Central Long Beach along Anaheim Street, from Pacific
Coast Highway down to 10th Street. Small enough that street names read at slide size.
"""
import json
import math
import os
import re
import ssl
import time
import urllib.request

import numpy as np
import pandas as pd
from PIL import Image, ImageOps

ROOT = os.getcwd()
RAW = os.path.join(ROOT, "data/raw")
OUT = os.path.join(ROOT, "dist/slides")

AREA = {
    "name": "Central Long Beach",
    "span": "Anaheim Street, PCH to 10th Street",
    "north": 33.7924,
    "south": 33.778,
    "west": -118.200,
    "east": -118.1719,
}
ZOOM = 15  # street names readable at slide size
CROWD_STORES = 4
UA = "mercaso-board-slides/1.0 (one-off board deck map; github.com/rickrangel-mer/mercaso-master-catalog)"


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def market_lists() -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Rick's market, deduplicated: customers from market_store_list.csv (active and churned; a store
    listed more than once under the same name and ZIP counts once, active over churned), and
    prospects from prospects.csv with a ZIP, without the ones already a customer and without repeats.
    The list's own 'prospect' rows are the same prospects, so they are left out.
    """
    m = pd.read_csv(os.path.join(RAW, "market_store_list.csv"), dtype=str)
    m["zip"] = m["zip"].fillna("").str[:5]
    m["key"] = m["name"].map(norm) + "|" + m["zip"]
    c = m[m.status.isin(["active", "churned"])].copy()
    c["rank"] = c.status.map({"active": 0, "churned": 1})
    c = c.sort_values(["key", "rank", "last_order_date"], ascending=[True, True, False]).drop_duplicates("key")
    p = pd.read_csv(os.path.join(RAW, "prospects.csv"), dtype=str)
    p = p[p.zip_code.notna()].copy()
    p["zip"] = p.zip_code.str.strip().str[:5]
    p["key"] = p["name"].map(norm) + "|" + p["zip"]
    p = p[~p.key.isin(set(c.key))].drop_duplicates("key")
    return c, p


def tile(z: int, x: int, y: int) -> Image.Image:
    path = os.path.join(RAW, "osm_tiles", f"{z}_{x}_{y}.png")
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt")
        req = urllib.request.Request(f"https://tile.openstreetmap.org/{z}/{x}/{y}.png", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            open(path, "wb").write(r.read())
        time.sleep(0.3)  # be gentle with the public tile server
    return Image.open(path).convert("RGB")


def px_x(lng: float) -> float:
    return (lng + 180) / 360 * 2**ZOOM * 256


def px_y(lat: float) -> float:
    s = math.sin(math.radians(lat))
    return (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * 2**ZOOM * 256


def located_prospects(customers: pd.DataFrame, coords: pd.DataFrame) -> tuple[pd.DataFrame, str]:
    """
    Prospects with coordinates: from the prospect list when it has them (latitude/longitude), else
    from rep visits. A listed prospect within 30 m of a store we serve or that stopped ordering is the
    same store listed twice, so it is left out; so are repeats (same name, same spot).
    """
    p = pd.read_csv(os.path.join(RAW, "prospects.csv"), dtype=str)
    cols = {c.lower(): c for c in p.columns}
    lat_col = cols.get("lat") or cols.get("latitude")
    lng_col = cols.get("lng") or cols.get("lon") or cols.get("longitude")
    if lat_col and lng_col:
        p = p.assign(lat=pd.to_numeric(p[lat_col], errors="coerce"), lng=pd.to_numeric(p[lng_col], errors="coerce")).dropna(subset=["lat", "lng"])
        p = p.assign(key=p["name"].map(norm) + "|" + p.lat.round(4).astype(str) + "," + p.lng.round(4).astype(str)).drop_duplicates("key")
        known = customers.join(coords, on="store_id").dropna(subset=["lat", "lng"])
        kx, ky = known.lng.to_numpy(), known.lat.to_numpy()
        coslat = math.cos(math.radians(34))
        # Distance from each prospect to the known stores, in blocks of 500.
        near = np.zeros(len(p), dtype=bool)
        plat, plng = p.lat.to_numpy(), p.lng.to_numpy()
        for i in range(0, len(p), 500):
            dy = (plat[i : i + 500, None] - ky[None, :]) * 110570
            dx = (plng[i : i + 500, None] - kx[None, :]) * 111320 * coslat
            near[i : i + 500] = ((dx**2 + dy**2) <= 30**2).any(axis=1)
        p["visited"] = pd.to_numeric(p.get("visit_count", 0), errors="coerce").fillna(0) > 0
        return p[~near][["lat", "lng", "visited"]], "list"
    v = pd.read_csv(os.path.join(RAW, "map_visits.csv"))
    v["spot"] = v.lat.round(3).astype(str) + "," + v.lng.round(3).astype(str)
    v = v[v.spot.map(v.groupby("spot").store_id.nunique()) < CROWD_STORES]
    known_ids = set(customers.store_id.dropna())
    d = v[(v.has_ordered == 0) & ~v.store_id.isin(known_ids)].groupby("store_id").agg(lat=("lat", "median"), lng=("lng", "median"))
    return d.reset_index()[["lat", "lng"]].assign(visited=True), "visits"


# Store markers on the slide (Rick, 2026-11-05): a green check for active stores, a yellow
# exclamation mark for prospects visited that never ordered, a red X for churned stores. Drawn here
# as small PNGs (the slide draws prospects never visited itself, as a white dot with a pink ring).
ICONS = {
    "active": ("#1FA463", "check", "#FFFFFF"),
    "visited": ("#FFC20E", "exclamation", "#1D1B3A"),
    "churned": ("#E03131", "x", "#FFFFFF"),
}


def draw_icons() -> None:
    from PIL import ImageDraw

    S = 256  # drawn large, then scaled down for smooth edges
    for kind, (fill, glyph, ink) in ICONS.items():
        im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.ellipse((8, 8, S - 8, S - 8), fill=fill, outline="#FFFFFF", width=14)
        w = 30
        if glyph == "check":
            d.line([(70, 132), (110, 172), (186, 88)], fill=ink, width=w, joint="curve")
            for x, y in [(70, 132), (110, 172), (186, 88)]:
                d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=ink)
        elif glyph == "x":
            for a, b in [((84, 84), (172, 172)), ((172, 84), (84, 172))]:
                d.line([a, b], fill=ink, width=w)
                for x, y in (a, b):
                    d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=ink)
        else:
            d.rounded_rectangle((113, 58, 143, 150), radius=15, fill=ink)
            d.ellipse((111, 168, 145, 202), fill=ink)
        im.resize((96, 96), Image.LANCZOS).save(os.path.join(OUT, f"icon-{kind}.png"))


def main() -> None:
    x0, y0, x1, y1 = px_x(AREA["west"]), px_y(AREA["north"]), px_x(AREA["east"]), px_y(AREA["south"])
    tx0, ty0, tx1, ty1 = int(x0 // 256), int(y0 // 256), int(x1 // 256), int(y1 // 256)
    canvas = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            canvas.paste(tile(ZOOM, tx, ty), ((tx - tx0) * 256, (ty - ty0) * 256))
    base = canvas.crop((int(x0 - tx0 * 256), int(y0 - ty0 * 256), int(x1 - tx0 * 256), int(y1 - ty0 * 256)))
    # Quiet the map so the markers read first: grey, a little washed out.
    base = Image.blend(ImageOps.grayscale(base).convert("RGB"), Image.new("RGB", base.size, "white"), 0.25)
    W, H = base.size
    os.makedirs(OUT, exist_ok=True)
    base.save(os.path.join(OUT, "gap-map.png"))

    def inside(d: pd.DataFrame) -> pd.DataFrame:
        return d[d.lat.between(AREA["south"], AREA["north"]) & d.lng.between(AREA["west"], AREA["east"])]

    # Our stores and the churned ones, at their address.
    customers, _ = market_lists()
    coords = pd.read_csv(os.path.join(RAW, "map_customers.csv")).set_index("store_id")[["lat", "lng"]]
    placed = inside(customers.join(coords, on="store_id").dropna(subset=["lat", "lng"]))
    prospects, source = located_prospects(customers, coords)
    prospects = inside(prospects)

    def markers(d: pd.DataFrame, kind: str) -> list[dict]:
        # Markers whose dot would hang over the map's edge are left off (they still count).
        pts = [((px_x(lng) - x0) / W, (px_y(lat) - y0) / H) for lat, lng in zip(d.lat, d.lng)]
        return [{"kind": kind, "fx": fx, "fy": fy} for fx, fy in pts if 0.012 <= fx <= 0.988 and 0.02 <= fy <= 0.98]

    # Four groups (Rick, 2026-11-05): active stores; churned stores; prospects a rep has visited that
    # never ordered; prospects never visited.
    active = placed[placed.status == "active"]
    churned = placed[placed.status == "churned"]
    visited = prospects[prospects.visited]
    not_visited = prospects[~prospects.visited]
    summary = {
        "area": AREA,
        "aspect": W / H,
        "width_km": round((AREA["east"] - AREA["west"]) * 111.32 * math.cos(math.radians((AREA["north"] + AREA["south"]) / 2)), 1),
        "height_km": round((AREA["north"] - AREA["south"]) * 110.57, 1),
        "active": len(active),
        "visited": len(visited),
        "churned": len(churned),
        "prospects": len(not_visited),
        "prospect_source": source,
        # Drawn in this order, so our stores sit on top.
        "markers": markers(not_visited, "prospect") + markers(visited, "visited") + markers(churned, "churned") + markers(active, "active"),
    }
    draw_icons()
    json.dump(summary, open(os.path.join(OUT, "gap-map.json"), "w"), indent=2)
    print(
        f"{AREA['name']} ({summary['width_km']} x {summary['height_km']} km, {W}x{H}px): {len(active)} active, "
        f"{len(visited)} visited never ordered, {len(churned)} churned, {len(not_visited)} prospects never visited (placed from {source})"
    )


if __name__ == "__main__":
    main()
