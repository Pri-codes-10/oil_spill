"""
app/ingest/geometry.py

B1: Convert detector masks into geographic geometry and Contract 1.

Important:
- Area is calculated geodesically using WGS84.
- Slick orientation is an undirected axis, so bearing is modulo 180.
"""

from pyproj import Geod
from rasterio.features import shapes
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

from app.config import (
    POLYGON_PROB_THRESHOLD,
    THRESHOLD_MIN_PIXELS,
)


GEOD = Geod(ellps="WGS84")


def mask_to_polygon(
    prob,
    transform,
    threshold=POLYGON_PROB_THRESHOLD,
    min_pixels=THRESHOLD_MIN_PIXELS,
):
    """
    Convert a probability mask into the largest significant polygon.

    Parameters
    ----------
    prob : numpy.ndarray
        2D probability-like mask.

    transform : rasterio.transform.Affine
        Geographic transform for the raster.

    threshold : float
        Minimum probability/confidence required for a pixel
        to become part of the candidate region.

    min_pixels : int
        Minimum number of pixels required for a region.

    Returns
    -------
    shapely.geometry.Polygon or None
        Largest valid polygon, or None if no region survives.
    """

    binary = (prob >= threshold).astype("uint8")

    if not binary.any():
        return None

    polygon_data = shapes(
        binary,
        mask=binary.astype(bool),
        transform=transform,
    )

    polygons = []

    for geom, value in polygon_data:
        if value != 1:
            continue

        polygon = shape(geom)

        if polygon.is_empty or polygon.area <= 0:
            continue

        polygons.append(polygon)

    if not polygons:
        return None

    significant = []

    for polygon in polygons:
        pixel_area = 0

        # Approximate pixel count from the rasterized polygon.
        # This prevents tiny detected regions from becoming slicks.
        minx, miny, maxx, maxy = polygon.bounds

        if maxx > minx and maxy > miny:
            pixel_area = int(prob[
                max(0, int(miny)):min(prob.shape[0], int(maxy) + 1),
                max(0, int(minx)):min(prob.shape[1], int(maxx) + 1),
            ].size)

        if pixel_area >= min_pixels:
            significant.append(polygon)

    if not significant:
        return None

    merged = unary_union(significant)

    if merged.is_empty:
        return None

    if hasattr(merged, "geoms"):
        parts = [
            part
            for part in merged.geoms
            if not part.is_empty and part.area > 0
        ]
    else:
        parts = [merged]

    if not parts:
        return None

    return max(parts, key=lambda part: part.area)


def geodesic_area_km2(poly):
    """
    Calculate polygon area in square kilometres using WGS84.
    """

    area_m2, _ = GEOD.geometry_area_perimeter(poly)

    return abs(area_m2) / 1_000_000.0


def axes_and_orientation(poly):
    """
    Calculate major axis, minor axis and undirected bearing.

    Bearing is returned in the range [0, 180).
    """

    rect = poly.minimum_rotated_rectangle

    xs, ys = rect.exterior.coords.xy
    points = list(zip(xs, ys))[:4]

    edges = []

    for i in range(4):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % 4]

        azimuth, _, distance_m = GEOD.inv(
            x1,
            y1,
            x2,
            y2,
        )

        edges.append(
            (
                distance_m / 1000.0,
                x1,
                y1,
                x2,
                y2,
                azimuth,
            )
        )

    edges.sort(
        key=lambda edge: edge[0],
        reverse=True,
    )

    major = edges[0]
    minor = edges[-1]

    bearing = major[5] % 180.0

    return (
        major[0],
        minor[0],
        bearing,
    )


def build_contract1(
    poly,
    observed_at,
    confidence,
    detector,
):
    """
    Build the frozen B1 -> B2 Contract 1 structure.
    """

    major, minor, bearing = axes_and_orientation(poly)

    centroid = poly.centroid

    return {
        "observed_at": observed_at.isoformat().replace(
            "+00:00",
            "Z",
        ),
        "crs": "EPSG:4326",
        "polygon": mapping(poly)["coordinates"],
        "area_km2": round(
            geodesic_area_km2(poly),
            3,
        ),
        "major_axis_km": round(
            major,
            3,
        ),
        "minor_axis_km": round(
            minor,
            3,
        ),
        "orientation_deg": round(
            bearing,
            2,
        ),
        "centroid": [
            round(centroid.x, 6),
            round(centroid.y, 6),
        ],
        "confidence": round(
            float(confidence),
            3,
        ),
        "detector": detector,
    }