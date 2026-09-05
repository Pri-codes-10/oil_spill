# YOLOv8 Sentinel-1 Oil-Spill Segmentation

This folder contains the reproducible YOLOv8n-seg experiment for binary oil-spill segmentation on the Sentinel-1 SAR Oil Spill Dataset Part I.

## Included artifacts

- `best.pt`: best checkpoint selected by Ultralytics during training.
- `yolov8_colab_comparison_metrics.json`: native instance-segmentation and semantic-union validation metrics.
- `prepare_yolov8_seg.py`: deterministic conversion of paired VV/VH GeoTIFF scenes and masks into YOLO segmentation tiles.
- `train_yolov8_seg.py`: command-line training entry point.
- `train_yolov8_seg_colab.ipynb`: Colab workflow used for the reported run.
- `sar_data.py`: SAR pairing and robust normalization utilities required by the preparation script.

The training dataset is intentionally not committed. Recreate it from the official Part I image and mask archives using the preparation script.

## Reported experiment

- Base model: `yolov8n-seg.pt` (pretrained)
- Ultralytics: 8.4.140
- Hardware: NVIDIA Tesla T4
- Training budget: 20 epochs with patience 5
- Input: 256 x 256 pixels
- Batch size: 32
- Seed: 42, deterministic mode enabled
- Split: 1,020 training scenes / 180 validation scenes
- Tiles: 2,040 training / 360 validation
- Channels: robust-normalized VV, robust-normalized VH, and scaled VV minus VH contrast

At confidence 0.20, the held-out semantic-union scores were IoU 0.7868, Dice 0.8807, precision 0.8829, and recall 0.8785. Native mask mAP50 was 0.4434 and mask mAP50-95 was 0.2476. See the JSON file for full-precision values and all confidence thresholds.

## Setup

```bash
python -m pip install -r requirements.txt
```

Prepare deterministic tiles from the audited split:

```bash
python prepare_yolov8_seg.py \
  --images /path/to/part_1/images \
  --masks /path/to/part_1/masks \
  --audit /path/to/sar_audit.json \
  --output data/yolov8_part1
```

Train locally:

```bash
python train_yolov8_seg.py \
  --data data/yolov8_part1/dataset.yaml \
  --model yolov8n-seg.pt \
  --epochs 20 \
  --image-size 256 \
  --batch-size 32 \
  --device 0 \
  --project outputs/yolov8 \
  --name yolov8n_seg_part1_e20
```

Run inference on a tile prepared with the same channel transform:

```python
from ultralytics import YOLO

model = YOLO("best.pt")
results = model.predict("tile.tif", imgsz=256, conf=0.20)
```

This is a screening model, not evidence of legal or causal responsibility for an oil spill.
