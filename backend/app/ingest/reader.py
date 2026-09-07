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


def band_count(tiff_path):
    """Number of raster bands in a product (2 for a dual-pol VV+VH file)."""
    with rasterio.open(tiff_path) as src:
        return src.count


def is_db_scale(arr):
    """True if `arr` already holds calibrated dB rather than amplitude DN.

    Amplitude DN is a magnitude, so it can never be negative; calibrated
    Sigma0 over water sits well below 0 dB. A negative median therefore tells
    the two apart, which is what stops to_db() from running a second time on
    products that ship pre-calibrated.

    ⚠️ This matters for real published datasets, not just theory: the Zenodo
    Sentinel-1 oil-spill dataset is float32 Sigma0 already in dB, whereas a
    raw GRD measurement band is uint16 amplitude. Converting the former again
    maps a valid -34 dB pixel to +31 dB — far outside config's SAR_DB_MIN/MAX
    — and the detector then sees a distribution nothing like its training set.
    """
    finite = arr[np.isfinite(arr)]
    if finite.size == 0:
        return False
    return bool(np.median(finite) < 0)


def to_db_if_needed(arr):
    """Convert amplitude DN to dB, or pass through data already in dB."""
    return arr if is_db_scale(arr) else to_db(arr)


def open_grd_band(tiff_path, max_dimension=None, band=1):
    """Open one GRD measurement band; return array, affine transform and CRS."""
    with rasterio.open(tiff_path) as src:
        scale = 1.0
        if max_dimension and max(src.height, src.width) > max_dimension:
            scale = max_dimension / max(src.height, src.width)
            out_height = max(1, round(src.height * scale))
            out_width = max(1, round(src.width * scale))
            arr = src.read(
                band,
                out_shape=(out_height, out_width),
                resampling=Resampling.average,
            ).astype("float32")
        else:
            arr = src.read(band).astype("float32")

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
