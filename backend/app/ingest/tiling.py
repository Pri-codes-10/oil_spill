"""
Tiling utilities for sliding-window inference.

app/ingest/tiling.py

B1: Sliding-window inference over a full SAR scene.

Tiles overlap so detections crossing tile boundaries are preserved.
Edge tiles are padded to the required tile size and cropped back
when stitching predictions.
"""

import numpy as np

from app.config import TILE_SIZE, TILE_OVERLAP


def iter_tiles(
    h,
    w,
    size=TILE_SIZE,
    overlap=TILE_OVERLAP,
):
    """Yield top-left coordinates for all scene windows."""

    if size <= 0:
        raise ValueError("size must be greater than zero")

    if overlap < 0 or overlap >= size:
        raise ValueError(
            "overlap must satisfy 0 <= overlap < size"
        )

    step = size - overlap

    rows = list(range(0, max(h - size, 0) + 1, step))
    cols = list(range(0, max(w - size, 0) + 1, step))

    if not rows or rows[-1] != max(h - size, 0):
        rows.append(max(h - size, 0))

    if not cols or cols[-1] != max(w - size, 0):
        cols.append(max(w - size, 0))

    for top in rows:
        for left in cols:
            yield top, left


def predict_scene(
    img,
    predict_fn,
    size=TILE_SIZE,
    overlap=TILE_OVERLAP,
):
    """Run sliding-window inference and stitch predictions."""

    if not isinstance(img, np.ndarray):
        raise TypeError("img must be a numpy.ndarray")

    if img.ndim != 3:
        raise ValueError(
            f"Expected image with shape (H, W, C), got {img.shape}"
        )

    h, w = img.shape[:2]

    acc = np.zeros(
        (h, w),
        dtype=np.float32,
    )

    weights = np.zeros(
        (h, w),
        dtype=np.float32,
    )

    for top, left in iter_tiles(
        h,
        w,
        size,
        overlap,
    ):
        bottom = min(top + size, h)
        right = min(left + size, w)

        tile = img[
            top:bottom,
            left:right,
        ]

        tile_h, tile_w = tile.shape[:2]

        if tile_h < size or tile_w < size:
            pad_h = size - tile_h
            pad_w = size - tile_w

            tile = np.pad(
                tile,
                (
                    (0, pad_h),
                    (0, pad_w),
                    (0, 0),
                ),
                mode="edge",
            )

        prediction = predict_fn(tile)

        if prediction.shape != (size, size):
            raise ValueError(
                "predict_fn must return a mask with shape "
                f"({size}, {size}), got {prediction.shape}"
            )

        prediction = prediction[
            :tile_h,
            :tile_w,
        ]

        acc[
            top:bottom,
            left:right,
        ] += prediction

        weights[
            top:bottom,
            left:right,
        ] += 1.0

    return acc / np.maximum(
        weights,
        1.0,
    )