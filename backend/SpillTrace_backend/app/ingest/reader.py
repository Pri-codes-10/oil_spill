"""B1: GRD reader and dB conversion."""

import numpy as np
import rasterio
from rasterio.transform import from_gcps


def open_grd_band(tiff_path):
    """
    Open one GRD measurement band.

    Sentinel-1 GRD geolocation is represented through GCPs; do not blindly
    trust src.transform on a raw GRD product.
    """
    with rasterio.open(tiff_path) as src:
        arr = src.read(1).astype("float32")
        gcps, gcp_crs = src.gcps

        if gcps:
            transform = from_gcps(gcps)
            crs = gcp_crs
        else:
            transform, crs = src.transform, src.crs

    return arr, transform, crs


def to_db(dn, calibration_constant=None):
    """
    Convert digital numbers to a dB-like representation.

    If no calibration LUT is supplied, this is an UNCALIBRATED PROXY.
    The UI/metadata should not call it calibrated sigma0.
    """
    power = np.square(dn, dtype="float32")
    if calibration_constant:
        power /= calibration_constant
    return 10.0 * np.log10(np.maximum(power, 1e-8))
