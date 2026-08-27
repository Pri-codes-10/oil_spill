"""B1: mask -> polygon and geodesic geometry."""

import numpy as np
from pyproj import Geod
from rasterio.features import shapes
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

GEOD = Geod(ellps="WGS84")


def mask_to_polygon(prob, transform, threshold=0.5, min_pixels=400):
    """Vectorize a probability mask and retain the largest valid component."""
    binary = (prob >= threshold).astype("uint8")

    polygons = [
        shape(geom)
        for geom, value in shapes(
            binary,
            mask=binary.astype(bool),
            transform=transform,
        )
        if value == 1
    ]

    if not polygons:
        return None

    merged = unary_union(polygons)
    parts = list(getattr(merged, "geoms", [merged]))
    parts = [part for part in parts if part.area > 0]

    if not parts:
        return None

    return max(parts, key=lambda part: part.area)


def geodesic_area_km2(poly):
    """Area in km² using WGS84 geodesics, not square degrees."""
    area_m2, _ = GEOD.geometry_area_perimeter(poly)
    return abs(area_m2) / 1e6


def axes_and_orientation(poly):
    """
    Return major axis, minor axis and undirected bearing.

    The bearing is modulo 180 because a slick axis has no direction.
    """
    rect = poly.minimum_rotated_rectangle
    xs, ys = rect.exterior.coords.xy
    points = list(zip(xs, ys))[:4]

    edges = []
    for i in range(4):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % 4]
        azimuth, _, distance_m = GEOD.inv(x1, y1, x2, y2)
        edges.append((distance_m / 1000.0, x1, y1, x2, y2, azimuth))

    edges.sort(key=lambda edge: edge[0], reverse=True)
    major = edges[0]
    minor_km = edges[-1][0]

    bearing = major[5] % 180.0
    return major[0], minor_km, bearing


def build_contract1(poly, observed_at, confidence, detector):
    """Build the frozen B1 -> B2 contract."""
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
