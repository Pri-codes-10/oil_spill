"""B1: protect pixel <-> lon/lat mapping after resizing."""

from affine import Affine

from app.common.geo import (
    lonlat_to_pixel,
    pixel_to_lonlat,
    scale_transform,
)

BASE = Affine(
    0.0001, 0, 72.0,
    0, -0.0001, 19.0,
)


def test_roundtrip_at_full_res():
    for row, col in [(0, 0), (511, 733), (2047, 2047)]:
        lon, lat = pixel_to_lonlat(BASE, row, col)
        assert lonlat_to_pixel(BASE, lon, lat) == (row, col)


def test_scaled_transform_maps_to_same_ground_point():
    """The centre point must stay on the same ground location after 4x resize."""
    small = scale_transform(
        BASE,
        (2048, 2048),
        (512, 512),
    )

    lon_a, lat_a = pixel_to_lonlat(BASE, 1024, 1024)
    lon_b, lat_b = pixel_to_lonlat(small, 256, 256)

    assert abs(lon_a - lon_b) < 1e-9
    assert abs(lat_a - lat_b) < 1e-9
