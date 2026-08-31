"""B1: Convert probability masks into geographic polygons."""

from rasterio.features import shapes
from shapely.geometry import shape
from shapely.ops import unary_union

from app.config import POLYGON_PROB_THRESHOLD


def mask_to_polygon(
    prob,
    transform,
    threshold=POLYGON_PROB_THRESHOLD,
):
    """Convert a probability mask into the largest valid polygon."""

    binary = (prob >= threshold).astype("uint8")

    if not binary.any():
        return None

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

    if merged.is_empty:
        return None

    parts = list(
        getattr(merged, "geoms", [merged])
    )

    parts = [
        part
        for part in parts
        if not part.is_empty and part.area > 0
    ]

    if not parts:
        return None

    return max(
        parts,
        key=lambda part: part.area,
    )