"""
app/ingest/geometry.py

OWNER: B1 (Ingest & Geospatial).
Produces CONTRACT 1 — see app/contracts.py for the frozen shape.

Two traps here, both of which silently produce wrong numbers (B1_INGEST.md §5):

  Trap 1 — you cannot compute area from degrees. shapely's .area on lon/lat
  coordinates returns square degrees, meaningless and latitude-dependent. Use
  a geodesic calculation (pyproj.Geod) instead.

  Trap 2 — a slick axis is UNDIRECTED. Orientation must be mod 180, not mod
  360 — a streak at 70 deg and one at 250 deg are the same axis. Getting this
  wrong breaks B3's heading-alignment factor, which depends on this value.
"""

from pyproj import Geod
from rasterio.features import shapes
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

from app.config import POLYGON_PROB_THRESHOLD, THRESHOLD_MIN_PIXELS

GEOD = Geod(ellps="WGS84")


def mask_to_polygon(prob, transform, threshold=POLYGON_PROB_THRESHOLD,
                     min_pixels=THRESHOLD_MIN_PIXELS):
    """Binarise, vectorise, keep significant parts, return one shapely geometry."""
    binary = (prob >= threshold).astype("uint8")
    polys = [
        shape(geom)
        for geom, val in shapes(binary, mask=binary.astype(bool), transform=transform)
        if val == 1
    ]
    if not polys:
        return None
    merged = unary_union(polys)
    parts = list(getattr(merged, "geoms", [merged]))
    parts = [p for p in parts if p.area > 0]
    if not parts:
        return None
    return max(parts, key=lambda p: p.area)


def geodesic_area_km2(poly):
    area_m2, _ = GEOD.geometry_area_perimeter(poly)
    return abs(area_m2) / 1e6


def axes_and_orientation(poly):
    """Major/minor axis in km and axis bearing in degrees (0=N, mod 180)."""
    rect = poly.minimum_rotated_rectangle
    xs, ys = rect.exterior.coords.xy
    pts = list(zip(xs, ys))[:4]

    edges = []
    for i in range(4):
        (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % 4]
        _, _, dist_m = GEOD.inv(x1, y1, x2, y2)
        edges.append((dist_m / 1000.0, x1, y1, x2, y2))

    edges.sort(key=lambda e: e[0], reverse=True)
    major = edges[0]
    minor_km = edges[-1][0]

    az, _, _ = GEOD.inv(major[1], major[2], major[3], major[4])
    bearing = az % 180.0                     # axis has no direction
    return major[0], minor_km, bearing


def build_contract1(poly, observed_at, confidence, detector):
    """Assemble CONTRACT 1. See app/contracts.py::validate_contract1."""
    major, minor, bearing = axes_and_orientation(poly)
    cx, cy = poly.centroid.x, poly.centroid.y
    return {
        "observed_at": observed_at.isoformat().replace("+00:00", "Z"),
        "crs": "EPSG:4326",
        "polygon": mapping(poly)["coordinates"],
        "area_km2": round(geodesic_area_km2(poly), 3),
        "major_axis_km": round(major, 3),
        "minor_axis_km": round(minor, 3),
        "orientation_deg": round(bearing, 2),
        "centroid": [round(cx, 6), round(cy, 6)],
        "confidence": round(float(confidence), 3),
        "detector": detector,
    }
