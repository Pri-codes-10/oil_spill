"""
app/ingest/tiling.py

OWNER: B1 (Ingest & Geospatial).

Slides a fixed-size window over a full scene and overlap-averages predictions
back into one raster. Overlap matters — a slick crossing a tile boundary gets
cut in half otherwise (B1_INGEST.md §4).
"""

import numpy as np

from app.config import TILE_SIZE, TILE_OVERLAP


def iter_tiles(h, w, size=TILE_SIZE, overlap=TILE_OVERLAP):
    step = size - overlap
    for top in range(0, max(h - overlap, 1), step):
        for left in range(0, max(w - overlap, 1), step):
            yield (min(top, max(h - size, 0)), min(left, max(w - size, 0)))


def predict_scene(img, predict_fn, size=TILE_SIZE, overlap=TILE_OVERLAP):
    """Sliding-window inference, overlap-averaged."""
    h, w = img.shape[:2]
    acc = np.zeros((h, w), dtype="float32")
    wgt = np.zeros((h, w), dtype="float32")
    for top, left in iter_tiles(h, w, size, overlap):
        tile = img[top:top + size, left:left + size]
        if tile.shape[0] < size or tile.shape[1] < size:
            continue
        acc[top:top + size, left:left + size] += predict_fn(tile)
        wgt[top:top + size, left:left + size] += 1.0
    return acc / np.maximum(wgt, 1.0)
