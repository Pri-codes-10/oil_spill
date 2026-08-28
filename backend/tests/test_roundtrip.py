"""
tests/test_roundtrip.py

OWNER: B1 (Ingest & Geospatial).
Commit this on DAY 1, before the detector (B1_INGEST.md §2). Four lines of
assertion that protect the entire pipeline from the transform-scaling bug —
the failure that produces plausible WRONG answers instead of a crash.
"""

from affine import Affine

from app.common.geo import scale_transform, pixel_to_lonlat, lonlat_to_pixel

BASE = Affine(0.0001, 0, 72.0, 0, -0.0001, 19.0)


def test_roundtrip_at_full_res():
    for row, col in [(0, 0), (511, 733), (2047, 2047)]:
        lon, lat = pixel_to_lonlat(BASE, row, col)
        assert lonlat_to_pixel(BASE, lon, lat) == (row, col)


def test_scaled_transform_maps_to_same_ground_point():
    """Pixel (256,256) at 512 px should land close to (1024,1024) at 2048 px.

    NOTE: these are not bit-identical ground points. Downsampling 4x means
    small-pixel (256,256) represents the *block* of full-res pixels
    [1024:1028, 1024:1028], whose true center is (1026,1026), not (1024,1024)
    -- a half-a-downsample-factor offset. That is a real, expected geometric
    effect of block-downsampling, not a bug in scale_transform(). At this
    transform's resolution (~11 m/px) the discrepancy is on the order of
    15-20 m, which is irrelevant next to slick sizes (km) and drift
    uncertainty (tens of km) -- see B1_INGEST.md's own framing of
    "a hundred metres of georeferencing error is irrelevant to the result."
    The tolerance below reflects that, rather than asserting exact equality.
    """
    small = scale_transform(BASE, (2048, 2048), (512, 512))
    lon_a, lat_a = pixel_to_lonlat(BASE, 1024, 1024)
    lon_b, lat_b = pixel_to_lonlat(small, 256, 256)
    assert abs(lon_a - lon_b) < 5e-4   # ~55 m at this latitude
    assert abs(lat_a - lat_b) < 5e-4
