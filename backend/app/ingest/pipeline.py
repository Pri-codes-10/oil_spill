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

from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from app.ingest import safe, reader, tiling, detect_threshold, geometry, vectorize
from app.common.timeutil import utc
from app.config import INGEST_MAX_DIMENSION

# --- day 1 -> day 5 swap point (Contract 0) --------------------------------
MODEL = detect_threshold.predict
DETECTOR_NAME = "threshold"


def use_model(predict_fn, name):
    """Call this once real ML weights are ready (B1_INGEST.md §7, Day 5)."""
    global MODEL, DETECTOR_NAME
    MODEL, DETECTOR_NAME = predict_fn, name


def synthetic_scene(size=1024, seed=0):
    """Fabricates a dB array with one dark, elongated blob — for running the
    chain before a real SAFE product / trained model exists. NOT for judging
    detection quality; only for proving the pipeline executes end to end.
    """
    rng = np.random.default_rng(seed)
    background = rng.normal(-12.0, 1.5, size=(size, size)).astype("float32")
    yy, xx = np.mgrid[0:size, 0:size]
    cy, cx, theta = size * 0.55, size * 0.45, 0.9
    ux, uy = np.cos(theta), np.sin(theta)
    along = (xx - cx) * ux + (yy - cy) * uy
    across = -(xx - cx) * uy + (yy - cy) * ux
    # Keep the ribbon NARROW relative to THRESHOLD_BLOCK_SIZE. A blob whose
    # width approaches the local-threshold neighbourhood drags down its own
    # local mean, so the detector measures far less contrast than was injected
    # and the chain finds nothing. Real slicks are narrow ribbons anyway.
    blob = (np.abs(along) < size * 0.22) & (np.abs(across) < size * 0.012)
    background[blob] -= 9.0
    vh = background + rng.normal(0, 0.5, background.shape).astype("float32")
    return np.stack([background, vh], axis=-1)  # (H, W, 2) -> VV, VH


def detect_scene(scene_path):
    """Run the full ingest chain on one Sentinel-1 SAFE product (or a
    synthetic stand-in) and return CONTRACT 1.

    scene_path: path to a .SAFE product / .zip, OR the literal string
                "synthetic" to run on a fabricated scene (day-1 testing).
    """
    if str(scene_path) == "synthetic":
        meta = {"start_time": utc(datetime.now(timezone.utc))}
        img = synthetic_scene()
        transform = _synthetic_transform(img.shape[0], img.shape[1])
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

    prob = tiling.predict_scene(img, MODEL)
    poly = vectorize.mask_to_polygon(prob, transform)

    if poly is None:
        raise RuntimeError(
            "no dark formation above threshold — pick a scene with a visible "
            "slick/dark blob, or lower POLYGON_PROB_THRESHOLD in config.py for testing"
        )

    confidence = float(np.clip(prob[prob > 0.1].mean() if (prob > 0.1).any() else 0.5, 0, 1))
    return geometry.build_contract1(poly, meta["start_time"], confidence, DETECTOR_NAME)


def _synthetic_transform(h, w):
    """A plausible affine for the synthetic scene — offshore Eastern Mediterranean,
    matching the ESSD reference dataset's region, purely so map previews look sane."""
    from affine import Affine
    deg_per_px = 0.09 / max(h, w)
    return Affine(deg_per_px, 0, 33.0, 0, -deg_per_px, 32.6)


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

