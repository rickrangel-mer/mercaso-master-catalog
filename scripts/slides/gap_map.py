"""
The market-gaps map for slide 3: one LA area on a real street map (OpenStreetMap), each ZIP shaded by
its prospect stores left, with Mercaso's active stores as dots on top.

    pnpm athena:export map-customers          # data/raw/map_customers.csv
    python3 scripts/slides/gap_map.py         # dist/slides/gap-map.png and gap-map.json
    pnpm slides:basket                        # places them on slide 3

Inputs, all in the gitignored data/raw/:
  market_store_list.csv  Rick's market list: active, churned and prospect stores by ZIP (deduplicated here)
  prospects.csv       Rick's prospect list (name, city, zip_code, ...); names never leave data/raw
  map_customers.csv   active stores' coordinates (`pnpm athena:export map-customers`), for the dots
  ca_zips.json        California ZIP (ZCTA 2010) boundaries, from
                      github.com/OpenDataDE/State-zip-code-GeoJSON (ca_california_zip_codes_geo.min.json)
  osm_tiles/          OpenStreetMap tiles, fetched once on first run and kept (needs
                      tile.openstreetmap.org allowed). Credit: (c) OpenStreetMap contributors.

Python packages: geopandas, matplotlib, pillow (pip install geopandas matplotlib pillow).

Market per ZIP = active + churned + prospects; "stores left" = churned + prospects (everything in the
market we don't serve today, visited or not). After deduplication the mappable market is ~11,750 stores
(prospects with no ZIP can't be placed), about 31% served.
"""
import json
import math
import re
import os
import ssl
import time
import urllib.request

import geopandas as gpd
import matplotlib
import pandas as pd
from PIL import Image, ImageOps
from shapely.affinity import affine_transform

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.colors import BoundaryNorm, ListedColormap  # noqa: E402

ROOT = os.getcwd()
RAW = os.path.join(ROOT, "data/raw")
OUT = os.path.join(ROOT, "dist/slides")

# The area: South Bay, Harbor & Long Beach. Picked by scanning 24 km squares over the LA basin for
# active stores x stores left; this one has dense pockets (Compton, Lynwood, Lomita, North Long Beach)
# next to big holes, at a penetration close to the company's (South & Central LA has more stores but
# is already at 36%).
AREA = {
    "name": "South Bay, Harbor & Long Beach",
    "span": "Hawthorne to Long Beach",
    "north": 33.936,
    "south": 33.72,
    "west": -118.375,
    "east": -118.115,
}
ZOOM = 12
# Place names drawn on the slide over the map (the tiles' own labels are too small at slide size).
PLACES = [
    ("Hawthorne", 33.916, -118.352), ("Gardena", 33.888, -118.309), ("Lynwood", 33.930, -118.211),
    ("Compton", 33.896, -118.220), ("Paramount", 33.889, -118.160), ("Torrance", 33.835, -118.341),
    ("Carson", 33.832, -118.282), ("Lakewood", 33.853, -118.134), ("Wilmington", 33.780, -118.262),
    ("Long Beach", 33.770, -118.193), ("San Pedro", 33.736, -118.292),
]
UA = "mercaso-board-slides/1.0 (one-off board deck map; github.com/rickrangel-mer/mercaso-master-catalog)"
# Stores left per ZIP: light to deep magenta.
BINS = [0, 10, 20, 30, 10_000]
COLORS = ["#FBE3EF", "#F7A8CF", "#ED008C", "#A3005F"]
LABELS = ["under 10", "10–19", "20–29", "30+"]


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


def main() -> None:
    x0, y0, x1, y1 = px_x(AREA["west"]), px_y(AREA["north"]), px_x(AREA["east"]), px_y(AREA["south"])
    tx0, ty0, tx1, ty1 = int(x0 // 256), int(y0 // 256), int(x1 // 256), int(y1 // 256)
    canvas = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            canvas.paste(tile(ZOOM, tx, ty), ((tx - tx0) * 256, (ty - ty0) * 256))
    base = canvas.crop((int(x0 - tx0 * 256), int(y0 - ty0 * 256), int(x1 - tx0 * 256), int(y1 - ty0 * 256)))
    # Quiet the map so the data reads first: grey, a little washed out.
    base = Image.blend(ImageOps.grayscale(base).convert("RGB"), Image.new("RGB", base.size, "white"), 0.3)
    W, H = base.size

    customers, prospects = market_lists()
    per_zip = pd.DataFrame(
        {
            "active": customers[customers.status == "active"].groupby("zip").size(),
            "stopped": customers[customers.status == "churned"].groupby("zip").size(),
            "prospects": prospects.groupby("zip").size(),
        }
    ).fillna(0)
    per_zip["left"] = per_zip.stopped + per_zip.prospects
    per_zip["market"] = per_zip.active + per_zip.left
    city = prospects.dropna(subset=["city"]).groupby("zip").city.agg(lambda c: c.value_counts().index[0])

    zips = gpd.read_file(os.path.join(RAW, "ca_zips.json"))[["ZCTA5CE10", "INTPTLAT10", "INTPTLON10", "geometry"]]
    zips = zips.rename(columns={"ZCTA5CE10": "zip"}).merge(per_zip, left_on="zip", right_index=True, how="left").fillna(
        {"active": 0, "stopped": 0, "prospects": 0, "left": 0, "market": 0}
    )
    zips["lat"] = zips.INTPTLAT10.astype(float)
    zips["lng"] = zips.INTPTLON10.astype(float)
    shown = zips.cx[AREA["west"] : AREA["east"], AREA["south"] : AREA["north"]].copy()
    # The area's totals count ZIPs whose centre is inside it.
    inside = shown[
        shown.lat.between(AREA["south"], AREA["north"]) & shown.lng.between(AREA["west"], AREA["east"])
    ]

    # Project to pixels: lon/lat -> web mercator -> this crop.
    R = 6378137
    shown = shown.set_crs(4326, allow_override=True).to_crs(3857)
    k = 2**ZOOM * 256 / (2 * math.pi * R)
    shown["geometry"] = shown.geometry.apply(lambda g: affine_transform(g, [k, 0, 0, -k, 2**ZOOM * 128 - x0, 2**ZOOM * 128 - y0]))

    fig = plt.figure(figsize=(W / 100, H / 100), dpi=300)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.imshow(base)
    ax.axis("off")
    cmap = ListedColormap(COLORS)
    norm = BoundaryNorm(BINS, len(COLORS))
    shown.plot(ax=ax, column="left", cmap=cmap, norm=norm, alpha=0.58, edgecolor="white", linewidth=0.6)
    coords = pd.read_csv(os.path.join(RAW, "map_customers.csv")).set_index("store_id")[["lat", "lng"]]
    act = customers[customers.status == "active"].join(coords, on="store_id").dropna(subset=["lat", "lng"])
    xs = act.lng.map(px_x) - x0
    ys = act.lat.map(px_y) - y0
    keep = xs.between(0, W) & ys.between(0, H)
    ax.scatter(xs[keep], ys[keep], s=9, c="#3B1A66", linewidths=0.35, edgecolors="white", zorder=5)
    ax.text(W - 3, H - 3, "© OpenStreetMap contributors", ha="right", va="bottom", fontsize=2.6, color="#555555", zorder=6)
    ax.set_xlim(0, W)
    ax.set_ylim(H, 0)
    os.makedirs(OUT, exist_ok=True)
    fig.savefig(os.path.join(OUT, "gap-map.png"))

    # The three biggest holes next to where we win: ZIPs with the most stores left that have at least
    # 10 active stores within 3 km of their centre, kept 4 km apart.
    def near_active(z):
        d = ((act.lat - z.lat) * 111) ** 2 + ((act.lng - z.lng) * 111 * math.cos(math.radians(34))) ** 2
        return int((d <= 9).sum())

    cand = inside.assign(near=inside.apply(near_active, axis=1)).query("near >= 10").sort_values("left", ascending=False)
    holes = []
    for _, z in cand.iterrows():
        if any(math.hypot((z.lat - h["lat"]) * 111, (z.lng - h["lng"]) * 92) < 4 for h in holes):
            continue
        holes.append(
            {
                "zip": z.zip,
                "name": str(city.get(z.zip, z.zip)).title(),
                "left": int(z.left),
                "active": int(z.active),
                "lat": float(z.lat),
                "lng": float(z.lng),
                "fx": float((px_x(z.lng) - x0) / W),
                "fy": float((px_y(z.lat) - y0) / H),
            }
        )
        if len(holes) == 3:
            break

    summary = {
        "area": AREA,
        "aspect": W / H,
        "active": int(inside.active.sum()),
        "left": int(inside.left.sum()),
        "prospects": int(inside.prospects.sum()),
        "stopped": int(inside.stopped.sum()),
        "market": int(inside.market.sum()),
        "company": {
            "active": int(per_zip.active.sum()),
            "market": int(per_zip.market.sum()),
        },
        "legend": [{"label": l, "color": c} for l, c in zip(LABELS, COLORS)],
        "places": [
            {"name": n, "fx": (px_x(lng) - x0) / W, "fy": (px_y(lat) - y0) / H}
            for n, lat, lng in PLACES
            if AREA["south"] <= lat <= AREA["north"] and AREA["west"] <= lng <= AREA["east"]
        ],
        "holes": holes,
    }
    json.dump(summary, open(os.path.join(OUT, "gap-map.json"), "w"), indent=2)
    print(
        f"{AREA['name']}: {summary['active']} active, {summary['left']} left "
        f"({summary['active'] / summary['market']:.1%} served); holes: "
        + "; ".join(f"{h['name']} {h['zip']} {h['left']} left / {h['active']} active" for h in holes)
    )


if __name__ == "__main__":
    main()
