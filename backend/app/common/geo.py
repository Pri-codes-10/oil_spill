"""
app/common/geo.py

OWNER: B1 (Ingest & Geospatial). Imported by B2 and B3 — never fork these
helpers into your own module; ask B1 to extend this file instead. Duplicated
CRS logic across three modules is how the hindcast ends up silently
misaligned (WORKFLOW.md §2, "Ingest & Geospatial" row).

Any change here can break both B2 and B3 downstream — give a heads-up in
chat before merging a PR that touches this file.
"""

from affine import Affine
from rasterio.transform import xy, rowcol


def scale_transform(transform, src_size, dst_size):
    """Adjust an affine transform after resizing an image.

    scale_transform(t, 2048, 512) -> transform valid for the 512 px version.

    THE TRANSFORM-SCALING BUG (B1_INGEST.md §2): downsample without scaling
    the transform and every detection is geotagged wrong by a believable
    margin. This is the failure mode that produces *plausible wrong answers*
    instead of a crash — nobody notices until a judge asks.
    """
    sx = src_size[0] / dst_size[0]
    sy = src_size[1] / dst_size[1]
    return transform * Affine.scale(sx, sy)


def pixel_to_lonlat(transform, row, col):
    x, y = xy(transform, row, col, offset="center")
    return x, y


def lonlat_to_pixel(transform, lon, lat):
    row, col = rowcol(transform, lon, lat)
    return int(row), int(col)
