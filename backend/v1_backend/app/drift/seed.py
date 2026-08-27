"""B2: seed particles over the entire B1 polygon."""

import numpy as np
from shapely.geometry import Point, Polygon


def seed_in_polygon(coords, n=500, rng=None):
    """Rejection-sample points uniformly inside a lon/lat polygon."""
    rng = rng or np.random.default_rng(0)

    polygon = Polygon(
        coords[0]
        if coords and isinstance(coords[0][0], (list, tuple))
        else coords
    )

    minx, miny, maxx, maxy = polygon.bounds
    lons, lats = [], []
    guard = 0

    while len(lons) < n and guard < n * 200:
        xs = rng.uniform(minx, maxx, 256)
        ys = rng.uniform(miny, maxy, 256)

        for x, y in zip(xs, ys):
            if polygon.contains(Point(x, y)):
                lons.append(x)
                lats.append(y)
                if len(lons) >= n:
                    break

        guard += 256

    if len(lons) < n:
        raise RuntimeError("Could not seed enough particles inside polygon.")

    return np.array(lons), np.array(lats)
