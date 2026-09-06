"""YOLOv8 segmentation adapter for the Contract 0 detector interface."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from skimage.transform import resize


WEIGHTS_PATH = Path(__file__).resolve().parents[3] / "model" / "yolov8_seg" / "best.pt"
MODEL_IMAGE_SIZE = 256
CONFIDENCE_THRESHOLD = 0.20
_MODEL = None


def load_model():
    """Load the trained checkpoint once and return it."""
    global _MODEL
    if _MODEL is None:
        from ultralytics import YOLO

        if not WEIGHTS_PATH.is_file():
            raise FileNotFoundError(f"YOLO weights not found: {WEIGHTS_PATH}")
        _MODEL = YOLO(str(WEIGHTS_PATH))
    return _MODEL


def _training_channels(tile: np.ndarray) -> np.ndarray:
    """Recreate prepare_yolov8_seg.py's normalized 3-channel uint8 input."""
    bands = np.asarray(tile, dtype=np.float32).transpose(2, 0, 1)
    normalized = np.empty_like(bands)
    for index, band in enumerate(bands):
        finite = np.isfinite(band)
        if not finite.any():
            normalized[index] = 0
            continue
        low, high = np.percentile(band[finite], [1.0, 99.0])
        normalized[index] = 0 if high <= low else np.clip((band - low) / (high - low), 0, 1)
        normalized[index][~finite] = 0

    vv, vh = normalized[0], normalized[1]
    contrast = np.clip(0.5 + 0.5 * (vv - vh), 0, 1)
    return np.rint(np.stack((vv, vh, contrast), axis=-1) * 255).astype(np.uint8)


def predict(tile: np.ndarray) -> np.ndarray:
    """Return a stitched binary-confidence mask for one inference tile."""
    image = _training_channels(tile)
    result = load_model().predict(
        source=image,
        imgsz=MODEL_IMAGE_SIZE,
        conf=CONFIDENCE_THRESHOLD,
        verbose=False,
        device="cpu",
    )[0]

    if result.masks is None or len(result.masks.data) == 0:
        return np.zeros(tile.shape[:2], dtype=np.float32)

    masks = result.masks.data.cpu().numpy().astype(np.float32)
    confidences = result.boxes.conf.cpu().numpy().astype(np.float32)
    combined = np.zeros(masks.shape[1:], dtype=np.float32)
    for mask, confidence in zip(masks, confidences):
        combined = np.maximum(combined, mask * confidence)

    if combined.shape != tile.shape[:2]:
        combined = resize(
            combined,
            tile.shape[:2],
            order=1,
            preserve_range=True,
            anti_aliasing=False,
        ).astype(np.float32)
    return combined
