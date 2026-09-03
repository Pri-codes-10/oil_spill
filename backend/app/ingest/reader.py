"""
app/ingest/reader.py

OWNER: B1 (Ingest & Geospatial).

⚠️ Sentinel-1 Level-1 GRD is NOT map-projected — it is in ground-range radar
geometry. `src.transform` on a raw GRD tiff is close to meaningless and
`src.crs` is often None. We fit an affine to the product's geolocation grid
(GCPs) instead. See B1_INGEST.md §0 for the three-route effort/accuracy
table (from_gcps -> gdal.Warp(tps=True) -> SNAP terrain correction).

A single fitted affine is an approximation (tens-to-hundreds of metres), but
slicks are kilometres wide and drift uncertainty is tens of kilometres — this
is a defensible engineering decision, not a shortcut. Say so if a judge asks.
"""

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import Affine, from_gcps


def open_grd_band(tiff_path, max_dimension=None):
    """Open one GRD measurement band; return array, affine transform and CRS."""
    with rasterio.open(tiff_path) as src:
        scale = 1.0
        if max_dimension and max(src.height, src.width) > max_dimension:
            scale = max_dimension / max(src.height, src.width)
            out_height = max(1, round(src.height * scale))
            out_width = max(1, round(src.width * scale))
            arr = src.read(
                1,
                out_shape=(out_height, out_width),
                resampling=Resampling.average,
            ).astype("float32")
        else:
            arr = src.read(1).astype("float32")

        gcps, gcp_crs = src.gcps
        if gcps:
            transform = from_gcps(gcps)
            crs = gcp_crs
        else:                                  # already geocoded product
            transform, crs = src.transform, src.crs
        if scale < 1.0:
            transform *= Affine.scale(src.width / arr.shape[1], src.height / arr.shape[0])
    return arr, transform, crs


def to_db(dn, calibration_constant=None):
    """Digital numbers -> dB.

    GRD pixels are amplitude DN. Proper sigma0 needs the calibration LUT from
    annotation/calibration/. For the demo we use an uncalibrated dB proxy and
    label it as such — relative darkness is what the detector keys on.

    ⚠️ Be honest in the UI about calibration. Training chips are true sigma0
    in dB; an uncalibrated proxy is a different distribution. If detection
    quality is poor on a real scene, this is the first suspect.
    """
    power = np.square(dn, dtype="float32")
    if calibration_constant:
        power /= calibration_constant
    return 10.0 * np.log10(np.maximum(power, 1e-8))
