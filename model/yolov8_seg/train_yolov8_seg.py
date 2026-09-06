"""Train a YOLOv8 instance-segmentation benchmark on prepared SAR tiles."""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--model", default="yolov8n-seg.pt")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--image-size", type=int, default=256)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--project", type=Path, default=Path("outputs/yolov8"))
    parser.add_argument("--name", default="part1_nano")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if not args.data.is_file():
        parser.error(f"dataset YAML does not exist: {args.data}")
    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise RuntimeError(
            "Ultralytics is optional; install it with: pip install ultralytics"
        ) from exc

    model = YOLO(args.model)
    model.train(
        task="segment",
        data=str(args.data.resolve()),
        epochs=args.epochs,
        imgsz=args.image_size,
        batch=args.batch_size,
        device=args.device,
        project=str(args.project.resolve()),
        name=args.name,
        seed=args.seed,
        workers=0,
        deterministic=True,
    )


if __name__ == "__main__":
    main()
