"""Sentinel-1 SAR segmentation dataset utilities."""

from __future__ import annotations

import random
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np


TIFF_SUFFIXES = {".tif", ".tiff"}


@dataclass(frozen=True)
class ScenePair:
    scene_id: str
    image: Path
    mask: Path


def _sample_id(path: Path) -> str:
    """Extract a stable trailing numeric ID, falling back to the full stem."""
    matches = re.findall(r"\d+", path.stem)
    return matches[-1].lstrip("0") or "0" if matches else path.stem.lower()


def discover_pairs(image_dir: str | Path, mask_dir: str | Path) -> list[ScenePair]:
    """Pair TIFF images and masks by their sample ID and reject ambiguity."""
    def index(folder: Path) -> dict[str, Path]:
        result: dict[str, Path] = {}
        for path in sorted(folder.rglob("*")):
            if path.is_file() and path.suffix.lower() in TIFF_SUFFIXES:
                key = _sample_id(path)
                if key in result:
                    raise ValueError(f"duplicate sample ID {key!r} in {folder}")
                result[key] = path
        return result

    images, masks = index(Path(image_dir)), index(Path(mask_dir))
    missing_masks = sorted(set(images) - set(masks))
    missing_images = sorted(set(masks) - set(images))
    if missing_masks or missing_images:
        raise ValueError(
            f"unpaired files: missing masks={missing_masks[:10]}, "
            f"missing images={missing_images[:10]}"
        )
    if not images:
        raise ValueError("no TIFF scene pairs found")
    return [ScenePair(key, images[key], masks[key]) for key in sorted(images)]


def split_scenes(
    pairs: Sequence[ScenePair], val_fraction: float = 0.15, seed: int = 42
) -> tuple[list[ScenePair], list[ScenePair]]:
    """Split whole scenes before patch extraction to prevent spatial leakage."""
    if not 0 < val_fraction < 1:
        raise ValueError("val_fraction must be between 0 and 1")
    if len(pairs) < 2:
        raise ValueError("at least two scenes are required for a split")
    shuffled = list(pairs)
    random.Random(seed).shuffle(shuffled)
    val_count = min(len(shuffled) - 1, max(1, round(len(shuffled) * val_fraction)))
    return shuffled[val_count:], shuffled[:val_count]


def robust_normalize_db(
    image: np.ndarray, low_percentile: float = 1.0, high_percentile: float = 99.0
) -> np.ndarray:
    """Clip each SAR band by robust percentiles and scale it to [0, 1]."""
    array = np.asarray(image, dtype=np.float32)
    if array.ndim != 3:
        raise ValueError("expected image shaped (bands, height, width)")
    output = np.empty_like(array)
    for band_index, band in enumerate(array):
        finite = np.isfinite(band)
        if not finite.any():
            raise ValueError(f"band {band_index} contains no finite pixels")
        low, high = np.percentile(band[finite], [low_percentile, high_percentile])
        if high <= low:
            output[band_index] = 0
        else:
            output[band_index] = np.clip((band - low) / (high - low), 0, 1)
        output[band_index][~finite] = 0
    return output


class Sentinel1PatchDataset:
    """Random-access, windowed VV/VH patches from paired GeoTIFF scenes.

    Rasterio and PyTorch are imported lazily so manifest tools remain usable in
    lightweight environments.
    """

    def __init__(
        self,
        pairs: Sequence[ScenePair],
        patch_size: int = 256,
        patches_per_scene: int = 16,
        seed: int = 42,
        positive_patch_probability: float = 0.0,
        min_positive_fraction: float = 0.001,
        max_sampling_attempts: int = 10,
    ) -> None:
        if patch_size <= 0 or patches_per_scene <= 0:
            raise ValueError("patch sizes and counts must be positive")
        if not 0 <= positive_patch_probability <= 1:
            raise ValueError("positive_patch_probability must be between 0 and 1")
        if not 0 <= min_positive_fraction <= 1 or max_sampling_attempts <= 0:
            raise ValueError("invalid positive-patch sampling configuration")
        self.pairs = list(pairs)
        self.patch_size = patch_size
        self.patches_per_scene = patches_per_scene
        self.seed = seed
        self.positive_patch_probability = positive_patch_probability
        self.min_positive_fraction = min_positive_fraction
        self.max_sampling_attempts = max_sampling_attempts

    def __len__(self) -> int:
        return len(self.pairs) * self.patches_per_scene

    def __getitem__(self, index: int):
        try:
            import rasterio
            import torch
            from rasterio.windows import Window
        except ImportError as exc:
            raise RuntimeError("install project dependencies with: pip install -e .") from exc

        pair = self.pairs[index // self.patches_per_scene]
        rng = random.Random(self.seed + index)
        with rasterio.open(pair.image) as image_src, rasterio.open(pair.mask) as mask_src:
            if image_src.count < 2:
                raise ValueError(f"{pair.image} must contain VV and VH bands")
            if (image_src.height, image_src.width) != (mask_src.height, mask_src.width):
                raise ValueError(f"shape mismatch for scene {pair.scene_id}")
            size = min(self.patch_size, image_src.height, image_src.width)
            seek_positive = rng.random() < self.positive_patch_probability
            attempts = self.max_sampling_attempts if seek_positive else 1
            for _ in range(attempts):
                row = rng.randint(0, image_src.height - size)
                col = rng.randint(0, image_src.width - size)
                window = Window(col, row, size, size)
                mask = mask_src.read(1, window=window).astype(np.float32)
                if not seek_positive or float((mask > 0).mean()) >= self.min_positive_fraction:
                    break
            image = image_src.read((1, 2), window=window).astype(np.float32)

        image = robust_normalize_db(image)
        mask = (mask > 0).astype(np.float32)[None, ...]
        # Safe geometric augmentation for SAR intensity data.
        if rng.random() < 0.5:
            image, mask = image[:, :, ::-1], mask[:, :, ::-1]
        if rng.random() < 0.5:
            image, mask = image[:, ::-1, :], mask[:, ::-1, :]
        return torch.from_numpy(image.copy()), torch.from_numpy(mask.copy())
