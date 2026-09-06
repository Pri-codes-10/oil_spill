"""Create deterministic YOLOv8-seg SAR tiles from the audited Part I split."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from sar_data import discover_pairs, robust_normalize_db


def point_line_distance(point, start, end) -> float:
    import numpy as np

    point, start, end = map(lambda value: np.asarray(value, dtype=np.float64), (point, start, end))
    segment = end - start
    denominator = float(np.dot(segment, segment))
    if denominator == 0:
        return float(np.linalg.norm(point - start))
    projection = start + segment * float(np.dot(point - start, segment) / denominator)
    return float(np.linalg.norm(point - projection))


def simplify_ring(points, epsilon: float):
    """Iterative Ramer-Douglas-Peucker simplification without recursion limits."""
    if len(points) <= 3:
        return points
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    while stack:
        start_index, end_index = stack.pop()
        maximum, split_index = 0.0, None
        for index in range(start_index + 1, end_index):
            distance = point_line_distance(points[index], points[start_index], points[end_index])
            if distance > maximum:
                maximum, split_index = distance, index
        if split_index is not None and maximum > epsilon:
            keep.add(split_index)
            stack.extend(((start_index, split_index), (split_index, end_index)))
    return [points[index] for index in sorted(keep)]


def polygon_area(points) -> float:
    return abs(sum(
        points[index][0] * points[(index + 1) % len(points)][1]
        - points[(index + 1) % len(points)][0] * points[index][1]
        for index in range(len(points))
    )) / 2.0


def exterior_rings(geometry):
    if geometry["type"] == "Polygon":
        yield geometry["coordinates"][0]
    elif geometry["type"] == "MultiPolygon":
        for polygon in geometry["coordinates"]:
            yield polygon[0]


def mask_to_yolo(mask, epsilon: float, minimum_area: float) -> list[str]:
    from rasterio.features import shapes

    height, width = mask.shape
    labels: list[str] = []
    for geometry, value in shapes(mask.astype("uint8"), mask=mask.astype(bool)):
        if int(value) != 1:
            continue
        for coordinates in exterior_rings(geometry):
            points = [(float(x), float(y)) for x, y in coordinates]
            if len(points) > 1 and points[0] == points[-1]:
                points = points[:-1]
            if len(points) < 3 or polygon_area(points) < minimum_area:
                continue
            simplified = simplify_ring(points, epsilon)
            if len(simplified) < 3:
                simplified = points
            values = ["0"]
            for x, y in simplified:
                values.extend((
                    f"{min(1.0, max(0.0, x / width)):.6f}",
                    f"{min(1.0, max(0.0, y / height)):.6f}",
                ))
            labels.append(" ".join(values))
    return labels


def choose_window(pair, dataset_index: int, patch_size: int, seed: int,
                  positive_probability: float, minimum_fraction: float, attempts: int):
    import numpy as np
    import rasterio
    from rasterio.windows import Window

    rng = random.Random(seed + dataset_index)
    with rasterio.open(pair.image) as image_source, rasterio.open(pair.mask) as mask_source:
        if min(image_source.height, image_source.width) < patch_size:
            raise ValueError(f"scene {pair.scene_id} is smaller than the requested tile")
        seek_positive = rng.random() < positive_probability
        row = col = 0
        mask = None
        for _ in range(attempts if seek_positive else 1):
            row = rng.randint(0, image_source.height - patch_size)
            col = rng.randint(0, image_source.width - patch_size)
            window = Window(col, row, patch_size, patch_size)
            mask = mask_source.read(1, window=window).astype(np.uint8) > 0
            if not seek_positive or float(mask.mean()) >= minimum_fraction:
                break
        image = image_source.read((1, 2), window=window).astype(np.float32)
    return row, col, robust_normalize_db(image), mask.astype(np.uint8)


def write_rgb_tiff(path: Path, image) -> None:
    import numpy as np
    import rasterio

    vv, vh = image[0], image[1]
    contrast = np.clip(0.5 + 0.5 * (vv - vh), 0, 1)
    rgb = np.rint(np.stack((vv, vh, contrast)) * 255).astype(np.uint8)
    with rasterio.open(
        path, "w", driver="GTiff", width=rgb.shape[2], height=rgb.shape[1],
        count=3, dtype="uint8", compress="deflate", photometric="RGB",
    ) as destination:
        destination.write(rgb)


def prepare_split(name, pairs, output, patch_size, patches_per_scene, seed,
                  positive_probability, epsilon, minimum_area):
    image_dir, label_dir = output / name / "images", output / name / "labels"
    image_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    for pair_index, pair in enumerate(pairs):
        for patch_index in range(patches_per_scene):
            dataset_index = pair_index * patches_per_scene + patch_index
            row, col, image, mask = choose_window(
                pair, dataset_index, patch_size, seed, positive_probability, 0.001, 10,
            )
            stem = f"scene_{pair.scene_id}_patch_{patch_index:02d}"
            image_path, label_path = image_dir / f"{stem}.tif", label_dir / f"{stem}.txt"
            write_rgb_tiff(image_path, image)
            labels = mask_to_yolo(mask, epsilon, minimum_area)
            label_path.write_text("\n".join(labels), encoding="utf-8")
            manifest.append({
                "split": name,
                "scene_id": pair.scene_id,
                "patch": patch_index,
                "row": row,
                "col": col,
                "positive_pixel_fraction": float(mask.mean()),
                "instances": len(labels),
            })
            if len(manifest) % 100 == 0:
                print(
                    f"prepared {len(manifest)}/{len(pairs) * patches_per_scene} {name} tiles",
                    flush=True,
                )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--images", type=Path, required=True)
    parser.add_argument("--masks", type=Path, required=True)
    parser.add_argument("--audit", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--patch-size", type=int, default=256)
    parser.add_argument("--patches-per-scene", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--positive-patch-probability", type=float, default=0.7)
    parser.add_argument("--simplify-epsilon", type=float, default=1.5)
    parser.add_argument("--minimum-polygon-area", type=float, default=4.0)
    args = parser.parse_args()
    if args.patch_size <= 0 or args.patch_size % 32:
        parser.error("patch-size must be positive and divisible by 32")
    if args.patches_per_scene <= 0:
        parser.error("patches-per-scene must be positive")

    audit = json.loads(args.audit.read_text(encoding="utf-8"))
    pairs = discover_pairs(args.images, args.masks)
    by_id = {pair.scene_id: pair for pair in pairs}
    train_ids = [str(value) for value in audit["train_scenes"]]
    val_ids = [str(value) for value in audit["val_scenes"]]
    missing = [value for value in train_ids + val_ids if value not in by_id]
    if missing:
        raise ValueError(f"audit split references missing scenes: {missing[:10]}")
    if set(train_ids) & set(val_ids):
        raise ValueError("audit train and validation splits overlap")

    train_pairs = [by_id[value] for value in train_ids]
    val_pairs = [by_id[value] for value in val_ids]
    manifest = prepare_split(
        "train", train_pairs, args.output, args.patch_size, args.patches_per_scene,
        args.seed, args.positive_patch_probability, args.simplify_epsilon,
        args.minimum_polygon_area,
    )
    manifest.extend(prepare_split(
        "val", val_pairs, args.output, args.patch_size, args.patches_per_scene,
        args.seed + 100_000, 0.0, args.simplify_epsilon, args.minimum_polygon_area,
    ))
    dataset_yaml = (
        f"path: {args.output.resolve().as_posix()}\n"
        "train: train/images\n"
        "val: val/images\n"
        "names:\n"
        "  0: oil_spill\n"
    )
    report = {
        "source_audit": str(args.audit.resolve()),
        "patch_size": args.patch_size,
        "patches_per_scene": args.patches_per_scene,
        "train_scenes": len(train_pairs),
        "val_scenes": len(val_pairs),
        "train_tiles": len(train_pairs) * args.patches_per_scene,
        "val_tiles": len(val_pairs) * args.patches_per_scene,
        "channels": ["VV", "VH", "scaled_VV_minus_VH"],
        "records": manifest,
    }
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "dataset.yaml").write_text(dataset_yaml, encoding="utf-8")
    (args.output / "manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "records"}))


if __name__ == "__main__":
    main()
