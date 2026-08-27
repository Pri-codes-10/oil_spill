"""B1: Classical fallback detector for SAR oil-slick detection."""

import numpy as np
from scipy import ndimage
from skimage.filters import threshold_local

from app.config import MIN_SLICK_PIXELS
from typing import Any, cast

def predict(tile):
    """Return a probability-like mask for dark regions in a SAR tile.

    Expected input shape: (H, W, 2)
    Channel 0: VV
    Channel 1: VH
    """

    # Validate input.
    if not isinstance(tile, np.ndarray):
        raise TypeError("tile must be a numpy.ndarray")

    if tile.ndim != 3:
        raise ValueError(
            f"Expected tile with shape (H, W, C), got {tile.shape}"
        )

    if tile.shape[2] < 1:
        raise ValueError("tile must contain at least one channel")

    # Use the VV channel.
    vv = tile[..., 0].astype(np.float32, copy=False)

    # Replace invalid pixels with the median of valid pixels.
    valid = np.isfinite(vv)

    if not np.any(valid):
        return np.zeros(vv.shape, dtype=np.float32)

    median_value = np.median(vv[valid])

    vv = np.nan_to_num(
        vv,
        nan=float(median_value),
        posinf=float(median_value),
        neginf=float(median_value),
    )

    # Reduce SAR speckle noise.
    vv = ndimage.median_filter(vv, size=5)

    # Calculate a local adaptive threshold.
    local = threshold_local(
        vv,
        block_size=201,
        offset=2,
    )

    # Select pixels that are darker than their local surroundings.
    dark = vv < local

    # Remove small isolated regions.
    dark = ndimage.binary_opening(
        dark,
        structure=np.ones((3, 3), dtype=bool),
    )

    # Fill small gaps inside candidate regions.
    dark = ndimage.binary_closing(
        dark,
        structure=np.ones((7, 7), dtype=bool),
    )

    # Label connected dark regions.
    labels = np.zeros(
        dark.shape,
        dtype=np.int32,
    )

    label_result = cast(Any, ndimage.label(
        dark,
        output=labels,
    ))
    labels = np.asarray(label_result[0])
    number_of_regions = int(label_result[1])

    number_of_regions = label_result[1]

    # Start with an empty confidence mask.
    output = np.zeros(
        vv.shape,
        dtype=np.float32,
    )

    if number_of_regions == 0:
        return output

    # Score each sufficiently large candidate region.
    for region_id in range(1, number_of_regions + 1):
        region_mask = labels == region_id
        area = int(region_mask.sum())

        if area < MIN_SLICK_PIXELS:
            continue

        local_mean = float(local[region_mask].mean())
        region_mean = float(vv[region_mask].mean())

        contrast = local_mean - region_mean

        # This is a confidence score, not a calibrated probability.
        confidence = np.clip(
            contrast / 6.0,
            0.15,
            0.95,
        )

        output[region_mask] = float(confidence)

    return output.astype(np.float32, copy=False)