"""
app/drift/corridor.py

OWNER: B2 (Drift & Metocean).
Produces CONTRACT 2 — see app/contracts.py for the frozen shape.

This is B2's actual deliverable: sweep lookback, perturb the uncertain
parameters, take the spread. The corridor (not a single origin point) is
"the best idea in the design" (B2_DRIFT.md §6) — a vessel must match in BOTH
space and time, which is what separates "the origin" from "a sighting."
"""

import numpy as np
from pyproj import Geod

from app.drift.metocean import MetoceanProvider
from app.drift.integrate import advect
from app.drift.seed import seed_in_polygon
from app.config import (
    SAMPLE_HOURS, ENSEMBLE_MEMBERS, ENSEMBLE_PARTICLES,
    CORRIDOR_RADIUS_PERCENTILE, DIFFUSIVITY_M2_S, MAX_LOOKBACK_HOURS,
)

GEOD = Geod(ellps="WGS84")


def build_corridor(contract1, field_source="analytic", n_members=ENSEMBLE_MEMBERS,
                    n_particles=ENSEMBLE_PARTICLES, max_hours=MAX_LOOKBACK_HOURS,
                    rng_seed=0):
    """Backward ensemble -> list of (hours_ago, lat, lon, radius_km) nodes."""
    rng = np.random.default_rng(rng_seed)
    lon0, lat0 = seed_in_polygon(contract1["polygon"], n=n_particles, rng=rng)

    per_hour = {h: {"lon": [], "lat": []} for h in SAMPLE_HOURS}

    # Resolve the field through the metocean seam BEFORE integrating. An
    # unimplemented source raises here rather than silently producing analytic
    # output wearing a real source's name (WORKFLOW.md §9).
    provider = MetoceanProvider(field_source)

    for m in range(n_members):
        # perturb exactly what we are genuinely unsure about
        field = provider.make_field(rng)
        track = advect(field, lon0, lat0, contract1["observed_at"],
                        hours=max_hours, backward=True,
                        diffusivity=DIFFUSIVITY_M2_S, rng=rng)
        by_hour = {round(h, 3): (lo, la) for h, lo, la in track}
        for h in SAMPLE_HOURS:
            key = min(by_hour, key=lambda k: abs(k - h))
            lo, la = by_hour[key]
            per_hour[h]["lon"].append(lo)
            per_hour[h]["lat"].append(la)

    nodes = []
    for h in SAMPLE_HOURS:
        lo = np.concatenate(per_hour[h]["lon"])
        la = np.concatenate(per_hour[h]["lat"])
        clon, clat = float(lo.mean()), float(la.mean())
        # radius = 90th percentile geodesic distance from the ensemble centre
        # (NOT the max — one stray particle shouldn't inflate the uncertainty)
        _, _, dist_m = GEOD.inv(np.full_like(lo, clon), np.full_like(la, clat), lo, la)
        radius_km = float(np.percentile(dist_m, CORRIDOR_RADIUS_PERCENTILE) / 1000.0)
        nodes.append({
            "hours_ago": h,
            "lat": round(clat, 5),
            "lon": round(clon, 5),
            "radius_km": round(max(radius_km, 1.0), 2),
        })

    return {
        "observed_at": contract1["observed_at"],
        "corridor": nodes,
        "field_source": provider.source,   # honest: what actually ran
    }
