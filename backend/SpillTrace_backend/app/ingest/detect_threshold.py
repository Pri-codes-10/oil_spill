"""B1: day-1 classical fallback detector.

Signature intentionally mirrors the external ML model:
predict(tile) -> probability mask.
"""

import numpy as np
from scipy import ndimage
from skimage.filters import threshold_local

from app.config import MIN_SLICK_PIXELS


def predict(tile):
    """
    Detect locally dark SAR regions.

    tile: float32 array shaped (H, W, 2), where channel 0 is VV.
    return: float32 probability-like mask in [0, 1].
    """
    vv = tile[..., 0]
    vv = ndimage.median_filter(vv, size=5)

    local = threshold_local(vv, block_size=201, offset=2.0)
    dark = vv < local

    # Morphology removes tiny speckles and closes small gaps.
    dark = ndimage.binary_opening(dark, np.ones((3, 3)))
    dark = ndimage.binary_closing(dark, np.ones((7, 7)))

    labels, n = ndimage.label(dark)
    out = np.zeros(vv.shape, dtype="float32")

    if n == 0:
        return out

    for lab in range(1, n + 1):
        mask = labels == lab
        area = int(mask.sum())
        if area < MIN_SLICK_PIXELS:
            continue

        contrast = float(local[mask].mean() - vv[mask].mean())
        out[mask] = float(np.clip(contrast / 6.0, 0.15, 0.95))

    return out
