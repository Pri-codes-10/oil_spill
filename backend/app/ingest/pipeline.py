"""
app/ingest/pipeline.py

OWNER: B1 (Ingest & Geospatial).

Glues safe.py + reader.py + tiling.py + detect_threshold.py + geometry.py
into the single entry point the rest of the team calls:

    detect_scene(scene_path) -> CONTRACT 1 dict

`scripts/run_chain.py` (B2) and `scripts/build_cache.py` (B3) both import
`detect_scene` from here, so the name and signature are fixed by existing
callers — do not rename it.

Day 1 -> Day 5 swap path (Contract 0, see app/contracts.py):
    MODEL = detect_threshold.predict          # day 1, classical baseline
    MODEL = unet_weights.predict               # day 5, one-line change

If no real SAFE product is on disk yet, `synthetic_scene()` fabricates a
plausible dark-blob dB tile so the WHOLE chain can run on day 1 before any
real data is downloaded — same philosophy as B2's analytic field and B3's
synthetic AIS: a dumb version that works today beats a sophisticated one
that might work Friday.
"""

import base64
import io
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image
from PIL import ImageDraw

from app.ingest import safe, reader, tiling, detect_threshold, geometry, vectorize
from app.common.timeutil import utc
from app.config import INGEST_MAX_DIMENSION

# --- day 1 -> day 5 swap point (Contract 0) --------------------------------
logger = logging.getLogger(__name__)

MODEL = detect_threshold.predict
DETECTOR_NAME = "threshold"

if os.getenv("OILSPILL_DETECTOR", "yolov8").lower() != "threshold":
    try:
        from app.ingest.detect_yolov8 import load_model, predict as predict_yolov8

        load_model()
        MODEL = predict_yolov8
        DETECTOR_NAME = "yolov8"
        logger.info("Using YOLOv8 oil-spill detector: model/yolov8_seg/best.pt")
    except (ImportError, FileNotFoundError, OSError, RuntimeError) as exc:
        logger.warning("YOLOv8 detector unavailable; using threshold fallback: %s", exc)


def use_model(predict_fn, name):
    """Call this once real ML weights are ready (B1_INGEST.md §7, Day 5)."""
    global MODEL, DETECTOR_NAME
    MODEL, DETECTOR_NAME = predict_fn, name


def synthetic_scene(
    size=1024,
    seed=0,
    cy_frac=0.55,
    cx_frac=0.45,
    theta=0.9,
    length_frac=0.22,
    width_frac=0.012,
    contrast_db=9.0,
):
    """Fabricates a dB array with one dark, elongated blob — for running the
    chain before a real SAFE product / trained model exists. NOT for judging
    detection quality; only for proving the pipeline executes end to end.

    The blob's geometry/contrast are parametrized (not just the RNG seed) so
    different demo scenes can be given genuinely different fabricated slicks
    instead of all producing identical Contract 1 output.
    """
    rng = np.random.default_rng(seed)
    background = rng.normal(-12.0, 1.5, size=(size, size)).astype("float32")
    yy, xx = np.mgrid[0:size, 0:size]
    cy, cx = size * cy_frac, size * cx_frac
    ux, uy = np.cos(theta), np.sin(theta)
    along = (xx - cx) * ux + (yy - cy) * uy
    across = -(xx - cx) * uy + (yy - cy) * ux
    # Keep the ribbon NARROW relative to THRESHOLD_BLOCK_SIZE. A blob whose
    # width approaches the local-threshold neighbourhood drags down its own
    # local mean, so the detector measures far less contrast than was injected
    # and the chain finds nothing. Real slicks are narrow ribbons anyway.
    blob = (np.abs(along) < size * length_frac) & (np.abs(across) < size * width_frac)
    background[blob] -= contrast_db
    vh = background + rng.normal(0, 0.5, background.shape).astype("float32")
    return np.stack([background, vh], axis=-1)  # (H, W, 2) -> VV, VH


# Per-demo-scene synthetic presets, keyed by the frontend's DEMO_SCENES id
# (frontend/src/data.ts). Each gives the fabricated blob a distinct
# position/angle/size/contrast AND anchors the affine transform near that
# scene's real-world location, so the 4 demo cards stop producing identical
# Contract 1 output while still clearly running on synthetic input.
SYNTHETIC_SCENE_PRESETS = {
    "north_sea": dict(
        seed=0, cy_frac=0.55, cx_frac=0.45, theta=0.9,
        length_frac=0.22, width_frac=0.012, contrast_db=9.0,
        lon0=2.05, lat0=58.40,
    ),
    "panama_canal": dict(
        seed=1, cy_frac=0.40, cx_frac=0.60, theta=2.4,
        length_frac=0.16, width_frac=0.020, contrast_db=6.5,
        lon0=-79.78, lat0=9.20,
    ),
    "gulf_mexico": dict(
        seed=2, cy_frac=0.62, cx_frac=0.35, theta=0.3,
        length_frac=0.30, width_frac=0.028, contrast_db=11.0,
        lon0=-91.30, lat0=27.86,
    ),
    "mediterranean": dict(
        seed=3, cy_frac=0.48, cx_frac=0.52, theta=1.6,
        length_frac=0.12, width_frac=0.009, contrast_db=5.0,
        lon0=14.82, lat0=36.47,
    ),
}


def detect_scene(scene_path):
    """Run the full ingest chain on one Sentinel-1 SAFE product (or a
    synthetic stand-in) and return CONTRACT 1.

    scene_path: path to a .SAFE product / .zip, OR the literal string
                "synthetic" (day-1 testing), OR one of
                SYNTHETIC_SCENE_PRESETS' keys to fabricate a scene-specific
                blob (frontend demo scene selection).
    """
    preset_key = str(scene_path) if str(scene_path) in SYNTHETIC_SCENE_PRESETS else None
    is_synthetic = str(scene_path) == "synthetic" or preset_key is not None
    scene_path = Path(scene_path) if not is_synthetic else scene_path

    if is_synthetic:
        preset = SYNTHETIC_SCENE_PRESETS.get(preset_key or "north_sea", SYNTHETIC_SCENE_PRESETS["north_sea"])
        blob_params = {k: v for k, v in preset.items() if k not in ("lon0", "lat0")}
        meta = {"start_time": utc(datetime.now(timezone.utc))}
        img = synthetic_scene(**blob_params)
        transform = _synthetic_transform(img.shape[0], img.shape[1], lon0=preset["lon0"], lat0=preset["lat0"])
    elif scene_path.suffix.lower() in {".jpg", ".jpeg"}:
        meta = {"start_time": datetime.fromtimestamp(
            scene_path.stat().st_mtime,
            tz=timezone.utc,
        )}
        with Image.open(scene_path) as source:
            grayscale = np.asarray(source.convert("L"), dtype="float32")
        img = np.stack([grayscale, grayscale], axis=-1)
        transform = _synthetic_transform(img.shape[0], img.shape[1])
    elif scene_path.suffix.lower() in {".tif", ".tiff"}:
        meta = {"start_time": datetime.fromtimestamp(
            scene_path.stat().st_mtime,
            tz=timezone.utc,
        )}
        vv_dn, transform, _crs = reader.open_grd_band(
            scene_path,
            max_dimension=INGEST_MAX_DIMENSION,
        )
        # Some real products (e.g. the Zenodo Sentinel-1 oil-spill dataset)
        # ship pre-calibrated float32 Sigma0 already in dB, not raw uint16
        # amplitude DN. Calling to_db() unconditionally double-converts those
        # files -- verified on a real scene: a -31 dB open-water median gets
        # mapped to +30 dB, which lands far outside SAR_DB_MIN/MAX and looks
        # nothing like the training distribution. to_db_if_needed() checks
        # is_db_scale() first and only converts amplitude DN.
        vv_db = reader.to_db_if_needed(vv_dn)

        # Real Sentinel-1 GRD tiffs commonly ship VV and VH as bands 1 and 2
        # of the same file (this is the format model/yolov8_seg was trained
        # against -- see prepare_yolov8_seg.py). Duplicating VV into the VH
        # slot flattens the model's VV-minus-VH contrast channel to a
        # constant, which is the single most informative input band, so we
        # read the real second band when the file provides one and only
        # fall back to duplicating VV for genuinely single-band rasters.
        if reader.band_count(scene_path) >= 2:
            # Same file, same max_dimension -> open_grd_band's internal
            # scale/out_shape computation is deterministic, so this always
            # comes back the same shape as vv_dn; no resize needed.
            vh_dn, _, _ = reader.open_grd_band(
                scene_path,
                max_dimension=INGEST_MAX_DIMENSION,
                band=2,
            )
            vh_db = reader.to_db_if_needed(vh_dn)
        else:
            logger.warning(
                "%s has a single band; duplicating VV into the VH slot -- "
                "the model's VV-VH contrast channel will carry no signal",
                scene_path,
            )
            vh_db = vv_db

        img = np.stack([vv_db, vh_db], axis=-1)
    else:
        meta = safe.parse_safe_name(scene_path)
        vv_path = _find_measurement_tiff(scene_path, "vv")
        vh_path = _find_measurement_tiff(scene_path, "vh")

        if vv_path is None:
            raise FileNotFoundError(
                f"no VV measurement TIFF found in SAFE product {Path(scene_path)}; "
                "ensure the product download is complete and contains "
                "measurement/*-vv-*.tiff"
            )

        vv_dn, transform, _crs = reader.open_grd_band(
            vv_path,
            max_dimension=INGEST_MAX_DIMENSION,
        )
        vv_db = reader.to_db(vv_dn)

        if vh_path is not None:
            vh_dn, _, _ = reader.open_grd_band(
                vh_path,
                max_dimension=INGEST_MAX_DIMENSION,
            )
            vh_db = reader.to_db(vh_dn)
        else:
            vh_db = vv_db.copy()   # single-pol product fallback

        img = np.stack([vv_db, vh_db], axis=-1)

    detector_name = DETECTOR_NAME
    prob = tiling.predict_scene(img, MODEL)
    poly = vectorize.mask_to_polygon(prob, transform)

    if poly is None:
        if detector_name != "threshold":
            logger.warning("%s returned no polygon; retrying with threshold fallback", detector_name)
            detector_name = "threshold"
            prob = tiling.predict_scene(img, detect_threshold.predict)
            poly = vectorize.mask_to_polygon(prob, transform)
        if poly is None:
            raise RuntimeError(
                "no dark formation above threshold — pick a scene with a visible "
                "slick/dark blob, or lower POLYGON_PROB_THRESHOLD in config.py for testing"
            )

    confidence = float(np.clip(prob[prob > 0.1].mean() if (prob > 0.1).any() else 0.5, 0, 1))
    result = geometry.build_contract1(poly, meta["start_time"], confidence, detector_name)
    result["overlay_image"] = _build_overlay_image(img, prob)
    return result


def _build_overlay_image(img, prob):
    """Encode a browser-friendly preview with the detected mask and box."""
    grayscale = np.asarray(img[..., 0], dtype="float32")
    finite = np.isfinite(grayscale)
    if not finite.any():
        grayscale = np.zeros(grayscale.shape, dtype="float32")
    else:
        low, high = np.percentile(grayscale[finite], [2, 98])
        grayscale = np.clip((grayscale - low) / max(high - low, 1e-6), 0, 1)

    mask = np.asarray(prob > 0.1, dtype=bool)
    rgb = np.repeat((grayscale * 255).astype("uint8")[..., None], 3, axis=2)
    rgb[mask] = (220, 38, 38)

    rows, cols = np.where(mask)
    if rows.size:
        image = Image.fromarray(rgb, mode="RGB")
        draw = ImageDraw.Draw(image)
        draw.rectangle((cols.min(), rows.min(), cols.max(), rows.max()), outline=(255, 214, 10), width=4)
    else:
        image = Image.fromarray(rgb, mode="RGB")

    image.thumbnail((1400, 1400), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _synthetic_transform(h, w, lon0=33.0, lat0=32.6):
    """A plausible affine for the synthetic scene, anchored at (lon0, lat0) —
    defaults to offshore Eastern Mediterranean (matching the ESSD reference
    dataset's region), but a demo-scene preset can anchor elsewhere so the
    detected centroid lands near the location its scene card claims."""
    from affine import Affine
    deg_per_px = 0.09 / max(h, w)
    return Affine(deg_per_px, 0, lon0, 0, -deg_per_px, lat0)


def _find_measurement_tiff(scene_path, pol):
    """Locate the VV/VH measurement GeoTIFF inside a SAFE product directory."""
    scene_path = Path(scene_path)
    hits = list(scene_path.glob(f"measurement/*-{pol}-*.tiff"))
    return hits[0] if hits else None

# Frontend-facing wrapper for detect_scene() with the flat response shape the UI expects.

def detect_scene_for_frontend(scene_path):
    """
    Run detection and return a JSON-serializable response.

    The frontend/API layer can call this function instead of
    directly dealing with the internal B1 processing objects.

    Example:

        result = detect_scene_for_frontend(
            "path/to/product.SAFE"
        )
    """

    result = detect_scene(scene_path)

    return result