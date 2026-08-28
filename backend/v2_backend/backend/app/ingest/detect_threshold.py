"""
app/ingest/detect_threshold.py

OWNER: B1 (Ingest & Geospatial).

Classical fallback detector — day-1 insurance. Build this BEFORE ml/ delivers
anything: it unblocks B2 and B3 immediately, and stays in the codebase
permanently as the classical baseline (B1_INGEST.md §3).

Exposes exactly Contract 0's signature, so swapping in the real U-Net later
is a one-line change in app/ingest/pipeline.py:

    predict(tile) -> probabilities
"""

import numpy as np
from scipy import ndimage
from skimage.filters import threshold_local

from app.config import (
    THRESHOLD_BLOCK_SIZE, THRESHOLD_OFFSET, THRESHOLD_MIN_PIXELS,
    THRESHOLD_CONTRAST_SCALE,
)


def predict(tile):
    """Classical fallback detector. Same contract as the U-Net.

    tile: float32 (H, W, 2) dB  ->  float32 (H, W) pseudo-probability in [0,1]

    Oil damps capillary waves, so slicks are LOCALLY dark. A local threshold
    beats a global one because backscatter varies with incidence angle.
    """
    vv = tile[..., 0]
    vv = ndimage.median_filter(vv, size=5)          # knock down speckle

    local = threshold_local(vv, block_size=THRESHOLD_BLOCK_SIZE, offset=THRESHOLD_OFFSET)
    dark = vv < local

    dark = ndimage.binary_opening(dark, np.ones((3, 3)))
    dark = ndimage.binary_closing(dark, np.ones((7, 7)))

    labels, n = ndimage.label(dark)
    out = np.zeros(vv.shape, dtype="float32")
    if n == 0:
        return out

    for lab in range(1, n + 1):
        mask = labels == lab
        area = int(mask.sum())
        if area < THRESHOLD_MIN_PIXELS:              # speckle, not a slick
            continue
        contrast = float(local[mask].mean() - vv[mask].mean())
        out[mask] = float(np.clip(contrast / THRESHOLD_CONTRAST_SCALE, 0.15, 0.95))
    return out
