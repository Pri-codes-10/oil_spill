"""B1-owned CRS/affine helpers shared by B2 and B3."""

from affine import Affine
from rasterio.transform import rowcol, xy


def scale_transform(transform, src_size, dst_size):
    """
    Adjust an affine transform after image resizing.

    Without this, downsampled detections can look plausible while being
    geotagged to the wrong ground position.
    """
    sx = src_size[0] / dst_size[0]
    sy = src_size[1] / dst_size[1]
    return transform * Affine.scale(sx, sy)


def pixel_to_lonlat(transform, row, col):
    """Convert raster pixel coordinates to ground coordinates."""
    x, y = xy(transform, row, col, offset="center")
    return x, y


def lonlat_to_pixel(transform, lon, lat):
    """Convert ground coordinates back to raster row/column."""
    row, col = rowcol(transform, lon, lat)
    return int(row), int(col)
