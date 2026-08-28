# B1 — Ingest & Geospatial

**You own:** `app/ingest/`, `app/common/`, `app/routers/ingest.py`
**You produce:** Contract 1 — a georeferenced polygon with geometry + UTC timestamp
**You are the seam** between the `ml/` folder and the rest of backend.

Two other people are blocked on your output. B2 cannot run drift without your
polygon and timestamp. Ship a *rough* Contract 1 early rather than a perfect one
late.

---

## ⚠️ Correction you need before day 1

I earlier told the team "rasterio reads the geotransform for you." **That is not
true for Sentinel-1 GRD**, and it changes your first few hours.

Sentinel-1 Level-1 GRD is **not map-projected**. It is in ground-range radar
geometry. The measurement GeoTIFF carries a **geolocation grid of GCPs** (ground
control points) instead of a clean affine transform. `src.transform` on a raw
GRD tiff is close to meaningless; `src.crs` is often `None`.

Three routes, in order of effort:

| Route | Effort | Accuracy | Use it? |
|---|---|---|---|
| `rasterio.transform.from_gcps()` — fit an affine to the GCPs | minutes | tens to hundreds of m | **yes, start here** |
| `gdal.Warp(..., tps=True)` — thin-plate spline warp via GCPs | ~an hour | good | day 5 upgrade |
| SNAP Range-Doppler Terrain Correction (`esa_snappy`) | painful | best | not this week |

A single affine fitted to the GCP grid is an approximation, but slicks are
**kilometres** wide and our drift uncertainty is **tens of kilometres**. A
hundred metres of georeferencing error is irrelevant to the result. Say this out
loud if a judge asks — it is a defensible engineering decision, not a shortcut.

---

## 1. Parse a SAFE product

The filename alone gives you acquisition time — parse it before opening
anything.

```python
# app/ingest/safe.py
import re
from datetime import datetime, timezone
from pathlib import Path

FNAME = re.compile(
    r"^(?P<mission>S1[ABCD])_(?P<mode>IW|EW|SM|WV)_(?P<ptype>GRD[HMF]?)_"
    r"(?P<pol>\w{4})_(?P<start>\d{8}T\d{6})_(?P<stop>\d{8}T\d{6})_"
    r"(?P<orbit>\d{6})_(?P<take>[0-9A-F]{6})_(?P<crc>[0-9A-F]{4})"
)


def parse_safe_name(path):
    """Pull mission, mode, polarisation, orbit and UTC times from the SAFE name.

    Sentinel-1 encodes all of this in the product filename, so we get the
    acquisition timestamp without opening a single byte of imagery.
    """
    stem = Path(path).name.replace(".SAFE", "").replace(".zip", "")
    m = FNAME.match(stem)
    if not m:
        raise ValueError(f"not a Sentinel-1 product name: {stem}")
    g = m.groupdict()

    def _t(s):
        return datetime.strptime(s, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)

    return {
        "mission": g["mission"],
        "mode": g["mode"],
        "product": g["ptype"],
        "polarisation": g["pol"],
        "absolute_orbit": int(g["orbit"]),
        "start_time": _t(g["start"]),
        "stop_time": _t(g["stop"]),
    }
```

Then read the pixels and build a transform from the GCPs:

```python
# app/ingest/reader.py
import numpy as np
import rasterio
from rasterio.transform import from_gcps


def open_grd_band(tiff_path):
    """Open one GRD measurement band; return array, affine transform and CRS.

    GRD is in radar geometry, so we fit an affine to the product's geolocation
    grid (GCPs) rather than trusting src.transform.
    """
    with rasterio.open(tiff_path) as src:
        arr = src.read(1).astype("float32")
        gcps, gcp_crs = src.gcps
        if gcps:
            transform = from_gcps(gcps)
            crs = gcp_crs
        else:                                  # already geocoded product
            transform, crs = src.transform, src.crs
    return arr, transform, crs


def to_db(dn, calibration_constant=None):
    """Digital numbers -> dB.

    GRD pixels are amplitude DN. Proper sigma0 needs the calibration LUT from
    annotation/calibration/. For the demo we use an uncalibrated dB proxy and
    label it as such -- relative darkness is what the detector keys on.
    """
    power = np.square(dn, dtype="float32")
    if calibration_constant:
        power /= calibration_constant
    return 10.0 * np.log10(np.maximum(power, 1e-8))
```

⚠️ **Be honest in the UI about calibration.** Training chips are true sigma0 in
dB; an uncalibrated proxy is a different distribution. If detection quality is
poor on the real scene, this is the first suspect. Proper calibration means
parsing `annotation/calibration/calibration-*.xml` and interpolating the LUT —
worth a day-5 upgrade if the U-Net underperforms.

---

## 2. The transform-scaling bug — write this test first

This is the failure that produces *plausible wrong answers* instead of crashes.
Downsample without scaling the transform and every detection is geotagged wrong
by a believable-looking margin. Nobody notices until a judge asks.

```python
# app/common/geo.py
from affine import Affine
from rasterio.transform import xy, rowcol


def scale_transform(transform, src_size, dst_size):
    """Adjust an affine transform after resizing an image.

    scale_transform(t, 2048, 512) -> transform valid for the 512 px version.
    """
    sx = src_size[0] / dst_size[0]
    sy = src_size[1] / dst_size[1]
    return transform * Affine.scale(sx, sy)


def pixel_to_lonlat(transform, row, col):
    x, y = xy(transform, row, col, offset="center")
    return x, y


def lonlat_to_pixel(transform, lon, lat):
    row, col = rowcol(transform, lon, lat)
    return int(row), int(col)
```

```python
# tests/test_roundtrip.py
from affine import Affine
from app.common.geo import scale_transform, pixel_to_lonlat, lonlat_to_pixel

BASE = Affine(0.0001, 0, 72.0, 0, -0.0001, 19.0)


def test_roundtrip_at_full_res():
    for row, col in [(0, 0), (511, 733), (2047, 2047)]:
        lon, lat = pixel_to_lonlat(BASE, row, col)
        assert lonlat_to_pixel(BASE, lon, lat) == (row, col)


def test_scaled_transform_maps_to_same_ground_point():
    """Pixel (256,256) at 512 px must be the same place as (1024,1024) at 2048."""
    small = scale_transform(BASE, (2048, 2048), (512, 512))
    lon_a, lat_a = pixel_to_lonlat(BASE, 1024, 1024)
    lon_b, lat_b = pixel_to_lonlat(small, 256, 256)
    assert abs(lon_a - lon_b) < 1e-9
    assert abs(lat_a - lat_b) < 1e-9
```

Commit this **on day 1, before the detector**. It is four lines of assertion that
protect the entire pipeline.

---

## 3. Threshold detector — your day-1 insurance

Build this before ML delivers anything. It unblocks B2 and B3 immediately, and it
stays in the codebase permanently as the classical baseline.

**Expose exactly the same signature as ML's model** so swapping is one line:

```python
# app/ingest/detect_threshold.py
import numpy as np
from scipy import ndimage
from skimage.filters import threshold_local


def predict(tile):
    """Classical fallback detector. Same contract as the U-Net.

    tile: float32 (H, W, 2) dB  ->  float32 (H, W) pseudo-probability in [0,1]
    Oil damps capillary waves, so slicks are LOCALLY dark. A local threshold
    beats a global one because backscatter varies with incidence angle.
    """
    vv = tile[..., 0]
    vv = ndimage.median_filter(vv, size=5)          # knock down speckle

    local = threshold_local(vv, block_size=201, offset=2.0)
    dark = vv < local

    dark = ndimage.binary_opening(dark, np.ones((3, 3)))
    dark = ndimage.binary_closing(dark, np.ones((7, 7)))

    labels, n = ndimage.label(dark)
    out = np.zeros(vv.shape, dtype="float32")
    if n == 0:
        return out

    for lab in range(1, n + 1):
        mask = labels == lab
        area = int(mask.sum())
        if area < 400:                              # speckle, not a slick
            continue
        contrast = float(local[mask].mean() - vv[mask].mean())
        out[mask] = float(np.clip(contrast / 6.0, 0.15, 0.95))
    return out
```

Tune `block_size`, `offset` and the minimum area on your real scene. Keep the
numbers in `config.py` so ML and the API read the same values.

---

## 4. Tiling and merging

Overlap matters: a slick crossing a tile boundary gets cut in half otherwise.
Average the overlaps with a weight map.

```python
# app/ingest/tiling.py
import numpy as np


def iter_tiles(h, w, size=512, overlap=64):
    step = size - overlap
    for top in range(0, max(h - overlap, 1), step):
        for left in range(0, max(w - overlap, 1), step):
            yield (min(top, max(h - size, 0)), min(left, max(w - size, 0)))


def predict_scene(img, predict_fn, size=512, overlap=64):
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
```

---

## 5. Mask → polygon → geometry

Two traps here, both of which silently produce wrong numbers.

**Trap 1: you cannot compute area from degrees.** `shapely`'s `.area` on
lon/lat coordinates returns square degrees, which is meaningless (and varies
with latitude). Use a geodesic calculation.

**Trap 2: a slick axis is undirected.** Orientation must be **mod 180**, not
mod 360 — a streak at 70° and one at 250° are the same axis. Getting this wrong
breaks the heading-alignment comparison that B3 depends on.

```python
# app/ingest/geometry.py
import math
import numpy as np
from pyproj import Geod
from rasterio.features import shapes
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

GEOD = Geod(ellps="WGS84")


def mask_to_polygon(prob, transform, threshold=0.5, min_pixels=400):
    """Binarise, vectorise, keep significant parts, return one shapely geometry."""
    binary = (prob >= threshold).astype("uint8")
    polys = [
        shape(geom)
        for geom, val in shapes(binary, mask=binary.astype(bool), transform=transform)
        if val == 1
    ]
    if not polys:
        return None
    merged = unary_union(polys)
    parts = list(getattr(merged, "geoms", [merged]))
    parts = [p for p in parts if p.area > 0]
    if not parts:
        return None
    return max(parts, key=lambda p: p.area)


def geodesic_area_km2(poly):
    lon, lat = poly.exterior.coords.xy
    area_m2, _ = GEOD.geometry_area_perimeter(poly)
    return abs(area_m2) / 1e6


def axes_and_orientation(poly):
    """Major/minor axis in km and axis bearing in degrees (0=N, mod 180)."""
    rect = poly.minimum_rotated_rectangle
    xs, ys = rect.exterior.coords.xy
    pts = list(zip(xs, ys))[:4]

    edges = []
    for i in range(4):
        (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % 4]
        _, _, dist_m = GEOD.inv(x1, y1, x2, y2)
        edges.append((dist_m / 1000.0, x1, y1, x2, y2))

    edges.sort(key=lambda e: e[0], reverse=True)
    major = edges[0]
    minor_km = edges[-1][0]

    az, _, _ = GEOD.inv(major[1], major[2], major[3], major[4])
    bearing = az % 180.0                     # axis has no direction
    return major[0], minor_km, bearing


def build_contract1(poly, observed_at, confidence, detector):
    major, minor, bearing = axes_and_orientation(poly)
    cx, cy = poly.centroid.x, poly.centroid.y
    return {
        "observed_at": observed_at.isoformat().replace("+00:00", "Z"),
        "crs": "EPSG:4326",
        "polygon": mapping(poly)["coordinates"],
        "area_km2": round(geodesic_area_km2(poly), 3),
        "major_axis_km": round(major, 3),
        "minor_axis_km": round(minor, 3),
        "orientation_deg": round(bearing, 2),
        "centroid": [round(cx, 6), round(cy, 6)],
        "confidence": round(float(confidence), 3),
        "detector": detector,
    }
```

**Sanity check with your own eyes on day 2:** paste the polygon into
[geojson.io](https://geojson.io). If it lands in the wrong sea, your transform is
wrong. This catches in five seconds what unit tests can miss.

---

## 6. UTC discipline — you own this for everyone

Every timestamp in the system is UTC and timezone-aware. A naive datetime is a
bug, and a silent UTC/local mix-up shifts the whole hindcast by hours.

```python
# app/common/timeutil.py
from datetime import datetime, timezone


def utc(dt):
    """Force any datetime to timezone-aware UTC. Reject nothing silently."""
    if dt.tzinfo is None:
        raise ValueError(f"naive datetime not allowed: {dt!r}")
    return dt.astimezone(timezone.utc)


def iso_z(dt):
    return utc(dt).isoformat().replace("+00:00", "Z")


def parse_iso_z(s):
    return utc(datetime.fromisoformat(s.replace("Z", "+00:00")))
```

Raising on naive datetimes is deliberate. It converts an invisible off-by-hours
bug into a loud crash at the boundary.

---

## 7. Your week

| Day | Deliverable |
|---|---|
| 1 | One real SAFE downloaded · `parse_safe_name` · GCP transform · **round-trip test committed** · threshold detector running |
| 2 | Polygon + geometry → **Contract 1 published to B2** · verified on geojson.io |
| 3 | `predict_scene` sliding window over the full scene |
| 4 | Integration only — no new features. Re-verify round-trip after tile/merge. |
| 5 | Swap in ML's U-Net behind the same `predict()` signature. Calibration LUT if time. |
| 6 | Help B3 precompute `cache/`. Freeze. |

---

## 8. Git

```bash
git switch -c be/b1/parse-safe
# work, commit small, push every evening
git push -u origin be/b1/parse-safe
```

Commit prefixes: `feat(be/ingest):`, `fix(be/ingest):`, `test(be/ingest):`,
and `feat(be/common):` when touching `geo.py` / `timeutil.py`.

```
feat(be/ingest): fit affine transform from GRD geolocation GCPs
test(be/common): assert pixel<->lonlat survives 4x downsample
fix(be/ingest): orientation is mod 180, an axis has no direction
```

**Reviewer:** B2 (you two share Contract 1).

**Special care:** you own `app/common/`, which B2 and B3 import. Any change to
`geo.py` or `timeutil.py` can break both of them — so those PRs get a heads-up
in chat before merge, and never a force-push. If someone asks for a new helper,
add it there rather than letting them fork their own copy. Duplicated CRS or
timezone logic across three modules is how the hindcast ends up silently
misaligned.

Never commit `*.tif`, `*.SAFE/`, or `*.zip`. One 8 GB scene in git history is
permanent and painful to remove.

---

## 9. Resources

**Verified this session**

- [Sentinel-1 product structure, GRD vs SLC, IW geometry](https://sentiwiki.copernicus.eu/web/s1-products)
  — the authority. Confirms IW geolocation accuracy ~7 m, per-beam incidence
  angles (IW1/2/3 = 32.9°/38.3°/43.1°), and that the filename carries
  start/stop time, orbit and data-take ID.
- Scene download: `dataspace.copernicus.eu` (free account) — verified free and
  open data policy.

**Read these (not verified this session — check as you go)**

- rasterio docs: `rasterio.transform.from_gcps`, `rasterio.features.shapes`,
  `rasterio.windows`
- shapely: `minimum_rotated_rectangle`, `unary_union`
- pyproj: `Geod.geometry_area_perimeter`, `Geod.inv`
- scikit-image: `threshold_local`
- ESA Sentinel-1 Product Specification **S1-RS-MDA-52-7441** §4.1–4.2 — the
  annotation XML schema, if you go after the calibration LUT
- `pyroSAR` — a friendlier wrapper over SNAP if GCP fitting proves insufficient

**Search terms that actually work:** "Sentinel-1 GRD georeferencing GCP",
"sigma0 calibration LUT annotation", "sentinel-1 oil spill dark formation
detection", "adaptive thresholding SAR oil slick".

---

## 10. Failure modes to watch

| Symptom | Likely cause |
|---|---|
| Polygon in the wrong ocean | GCP transform not applied, or lon/lat swapped |
| Area is ~0.000001 | computing `.area` in degrees instead of geodesic |
| Orientation flips 180° between runs | not taking mod 180 |
| Detector finds the whole scene | `offset` too small, or land not masked |
| Detector finds nothing | uncalibrated dB range differs from training distribution |
| Hindcast off by hours | naive datetime leaked past `utc()` |

**Mask land early.** A coastline is dark in SAR and will light up your detector.
Simplest fix for the demo: pick an offshore scene with no land in frame. Proper
fix: a coastline shapefile from Natural Earth as a veto mask.
