"""B1: overlapping scene tiling and merge."""

import numpy as np


def iter_tiles(h, w, size=512, overlap=64):
    """Yield top-left positions for overlapping square tiles."""
    step = size - overlap
    for top in range(0, max(h - overlap, 1), step):
        for left in range(0, max(w - overlap, 1), step):
            yield (
                min(top, max(h - size, 0)),
                min(left, max(w - size, 0)),
            )


def predict_scene(img, predict_fn, size=512, overlap=64):
    """
    Sliding-window inference with overlap averaging.

    This function does not care whether predict_fn is B1's threshold model
    or the external ML U-Net.
    """
    h, w = img.shape[:2]
    acc = np.zeros((h, w), dtype="float32")
    weight = np.zeros((h, w), dtype="float32")

    for top, left in iter_tiles(h, w, size, overlap):
        tile = img[top:top + size, left:left + size]

        # Ignore incomplete edge tiles in this day-1 implementation.
        if tile.shape[0] < size or tile.shape[1] < size:
            continue

        acc[top:top + size, left:left + size] += predict_fn(tile)
        weight[top:top + size, left:left + size] += 1.0

    return acc / np.maximum(weight, 1.0)
