# SpillTrace — SIH 2026 PS 2026143

SAR-based oil spill detection → drift hindcasting → AIS vessel attribution.

Given a Sentinel-1 scene showing a slick, SpillTrace segments the slick, runs
the drift backwards to build a space-time corridor of where it *came from*,
then ranks AIS vessel tracks that were in that corridor at the right time.

The three stages are deliberately decoupled through frozen contracts
(`backend/app/contracts.py`) so three people can build in parallel without
blocking each other. `docs/` holds the source design docs and is the authority
on *why*; this file covers *how to run it*.

## Layout

```
.
├── backend/    FastAPI service — ingest (B1), drift (B2), attribution (B3)
├── frontend/   React + Vite + Leaflet/MapLibre UI
├── model/      YOLOv8-seg oil-spill weights + training scripts
└── docs/       OVERVIEW.md, WORKFLOW.md, DAY0.md
```

One directory per person inside `backend/app/`, per `docs/WORKFLOW.md`. Every
file's docstring opens with an `OWNER:` line — read it before editing.

## Quickstart

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

copy .env.example .env          # AIS + Postgres config, optional for detection

python mocks\generate.py        # mock JSON the frontend builds against
python scripts\run_chain.py synthetic
python -m pytest tests\ -v

.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

On bash, use `source .venv/bin/activate` and forward slashes.

**Launch uvicorn through the venv's Python, not bare `uvicorn`.** A global
Python install earlier on `PATH` will shadow the venv, and its interpreter has
no `ultralytics` — the symptom is `YOLOv8 detector unavailable; using threshold
fallback: No module named 'ultralytics'` while `pip list` inside the venv shows
it installed.

### Frontend

```powershell
cd frontend
npm install
npm run dev                      # http://localhost:3000
```

The API base URL is hardcoded to `http://127.0.0.1:8000` in
`frontend/src/api/api.ts`. Backend CORS allows `localhost:3000` and
`127.0.0.1:3000`; any other origin gets a bare `400` on the OPTIONS preflight,
because Starlette's CORS middleware matches origins byte-for-byte and does not
resolve hostnames.

## API

| Method | Endpoint | Body |
|---|---|---|
| GET | `/api/health` | — |
| GET | `/api/ingest/mock` | — (frozen mock, needs `mocks/generate.py`) |
| POST | `/api/ingest/detect` | `{"scene_path": "synthetic"}` |
| POST | `/api/ingest/upload` | multipart file: `.jpg`, `.tif`, `.zip`, `.SAFE` |
| POST | `/api/drift/corridor` | `{"contract1": {...}, "field_source": "analytic"}` |
| GET | `/api/drift/mock` | — |
| POST | `/api/attribution/rank` | `{"contract2": {...}, "slick_bearing_deg": 70.2, "use_synthetic_ais": true}` |
| GET | `/api/attribution/mock` | — |

`field_source` accepts `analytic` (default) or `cmems_era5` once real metocean
readers are wired in; `use_synthetic_ais` defaults to `true`.

`scene_path` also accepts a demo-scene key (`north_sea`, `panama_canal`,
`gulf_mexico`, `mediterranean`) to fabricate a scene-specific synthetic slick,
or a real path on disk.

Every ingest endpoint falls back to `mocks/polygon.json` if detection raises,
so a half-built detector never blocks frontend work. That fallback means a
`200` is **not** proof the detector ran — check the `detector` field in the
response.

## Detection

`app/ingest/pipeline.py` selects the detector at import time:

- **`yolov8`** (default) — `model/yolov8_seg/best.pt`, loaded if `ultralytics`
  imports and the weights are present. The weights are committed, so a clone
  needs no download.
- **`threshold`** — classical local-threshold baseline
  (`app/ingest/detect_threshold.py`). Also the automatic per-request fallback
  when YOLO returns no polygon.

Force the baseline with `OILSPILL_DETECTOR=threshold`.

Inference is sliding-window: `TILE_SIZE=512` with `TILE_OVERLAP=64`
(`app/config.py`), each tile resized to the model's `imgsz=256`.

### Measured performance

Against the [Zenodo Sentinel-1 oil-spill dataset](https://zenodo.org/records/8346860)
with its ground-truth masks, tiled at 512, 6 scenes:

| channel order | mean IoU | mean recall | scenes detected |
|---|---|---|---|
| `(VV, VH, contrast)` | 0.453 | 0.602 | 5/6 |
| **`(contrast, VH, VV)`** | **0.741** | **0.951** | **6/6** |

The second row is what ships. The ordering is not cosmetic: training tiles are
written to GeoTIFF as `(VV, VH, contrast)`, but Ultralytics loads them through
OpenCV, which returns BGR — so the network trained on the reversed order, and
`model.predict()` on an in-memory array treats it as BGR too. Getting this
wrong silently halves IoU rather than erroring.

**These numbers are an optimistic ceiling, not a test score.** The scenes come
from `01_Train_Val`, which is the checkpoint's own training data. The
checkpoint's recorded validation metrics are far more sober — mask recall
0.376, mAP50 0.443, from `yolov8n-seg` (smallest variant) at 20 epochs. For an
honest figure, evaluate against Part II/III of that Zenodo record as a held-out
set.

### Input formats

The detector expects Sentinel-1 dB values. Two real formats differ in a way
that matters:

- **Raw GRD measurement bands** are uint16 amplitude DN and need
  `reader.to_db()`.
- **Published datasets** (including the Zenodo one) ship float32 Sigma0
  *already in dB*.

`reader.to_db_if_needed()` tells them apart by median sign — amplitude is a
magnitude and cannot be negative, while water in dB sits well below zero.
Converting already-dB data a second time maps a valid −34 dB pixel to +31 dB,
far outside `SAR_DB_MIN`/`SAR_DB_MAX`, and the detector then sees a
distribution nothing like its training set.

Ordinary photographs and screenshots will not work. Their pixel statistics
don't resemble SAR at all, YOLO returns nothing, and you silently get the
threshold detector's output labelled as such in the `detector` field.

## Known rough edges

- `requirements.txt` pins `ultralytics` but not `torch`, so torch resolves
  differently per machine. Installing ultralytics also pulls `httpx` past the
  pinned `0.27.2`, leaving the file no longer describing a working venv.
- Getting one file out of the Zenodo images archive is not possible — it's a
  single 40.7 GB `.7z` and the server ignores HTTP range requests. The masks
  archive is only 6.2 MB.
- AIS attribution runs on synthetic tracks, and this is by design rather than a
  stopgap: a live AIS collector cannot supply vessel positions contemporaneous
  with a historical SAR scene.

## Contributing

`docs/WORKFLOW.md` is the process authority. In short: branch per change, don't
commit to `main` directly, and don't edit another owner's directory without a
heads-up — `app/contracts.py`, `app/config.py`, and `app/main.py` are shared and
frozen, so changes there need agreement from both sides of the contract.

```powershell
cd backend
python scripts\preflight.py B2    # your role: B1, B2, or B3
python -m pytest tests\ -v
```
