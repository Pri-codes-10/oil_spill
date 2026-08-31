"""
app/ingest/geometry.py

B1: Geospatial measurements and Contract 1.

Area is calculated geodesically using WGS84.

Slick orientation is an undirected axis, so bearing is
reported modulo 180 degrees.
"""

from pyproj import Geod
from shapely.geometry import mapping


GEOD = Geod(ellps="WGS84")


def geodesic_area_km2(poly):
    """Calculate polygon area in square kilometres."""

    area_m2, _ = GEOD.geometry_area_perimeter(poly)

    return abs(area_m2) / 1_000_000.0


def axes_and_orientation(poly):
    """
    Calculate major axis, minor axis and undirected bearing.

    Bearing is returned in the range [0, 180).
    """

    rectangle = poly.minimum_rotated_rectangle

    xs, ys = rectangle.exterior.coords.xy
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
    """Build the frozen B1 -> B2 Contract 1 structure."""

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