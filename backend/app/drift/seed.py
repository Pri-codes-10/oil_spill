"""
app/drift/seed.py

OWNER: B2 (Drift & Metocean).

Seeds particles across B1's WHOLE polygon, not just the centroid — the
slick's extent is information (B2_DRIFT.md §4).

⚠️ If you later switch to OpenDrift's seed_elements(..., radius=): their docs
are explicit that radius is ONE STANDARD DEVIATION of a normal distribution,
so only ~68% of particles land inside it and they cluster toward the centre.
Report that radius as your uncertainty and you understate it badly.
"""

import numpy as np
from shapely.geometry import Polygon, Point


def seed_in_polygon(coords, n=500, rng=None):
    """Rejection-sample n points uniformly inside a lon/lat polygon."""
    rng = rng or np.random.default_rng(0)
    poly = Polygon(coords[0] if isinstance(coords[0][0], (list, tuple)) else coords)
    minx, miny, maxx, maxy = poly.bounds
    lons, lats = [], []
    guard = 0
    while len(lons) < n and guard < n * 200:
        x = rng.uniform(minx, maxx, 256)
        y = rng.uniform(miny, maxy, 256)
        for xi, yi in zip(x, y):
            if poly.contains(Point(xi, yi)):
                lons.append(xi)
                lats.append(yi)
                if len(lons) >= n:
                    break
        guard += 256
    return np.array(lons), np.array(lats)
