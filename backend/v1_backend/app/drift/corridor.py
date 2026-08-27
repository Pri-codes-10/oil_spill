"""B2: backward ensemble -> Contract 2 space-time corridor."""

import numpy as np
from pyproj import Geod

from app.config import SAMPLE_HOURS
from app.drift.field_analytic import AnalyticField
from app.drift.integrate import advect
from app.drift.seed import seed_in_polygon

GEOD = Geod(ellps="WGS84")


def build_corridor(
    contract1,
    field_source="analytic",
    n_members=8,
    n_particles=300,
    max_hours=72,
    rng_seed=0,
):
    """
    Build a corridor across the lookback range.

    Radius is the 90th percentile of geodesic distance from the ensemble
    centre, rather than the maximum, so one stray particle does not dominate.
    """
    rng = np.random.default_rng(rng_seed)

    lon0, lat0 = seed_in_polygon(
        contract1["polygon"],
        n=n_particles,
        rng=rng,
    )

    per_hour = {h: {"lon": [], "lat": []} for h in SAMPLE_HOURS}

    for _ in range(n_members):
        # Perturb parameters that are genuinely uncertain.
        field = AnalyticField(
            u0=0.35 * rng.normal(1.0, 0.20),
            v0=0.10 * rng.normal(1.0, 0.30),
            wind_factor=rng.uniform(0.015, 0.035),
        )

        track = advect(
            field,
            lon0,
            lat0,
            contract1["observed_at"],
            hours=max_hours,
            backward=True,
            diffusivity=1.0,
            rng=rng,
        )

        by_hour = {
            round(hours, 3): (lons, lats)
            for hours, lons, lats in track
        }

        for hours in SAMPLE_HOURS:
            key = min(by_hour, key=lambda k: abs(k - hours))
            lons, lats = by_hour[key]
            per_hour[hours]["lon"].append(lons)
            per_hour[hours]["lat"].append(lats)

    nodes = []

    for hours in SAMPLE_HOURS:
        lons = np.concatenate(per_hour[hours]["lon"])
        lats = np.concatenate(per_hour[hours]["lat"])

        centre_lon = float(lons.mean())
        centre_lat = float(lats.mean())

        _, _, dist_m = GEOD.inv(
            np.full_like(lons, centre_lon),
            np.full_like(lats, centre_lat),
            lons,
            lats,
        )

        radius_km = float(np.percentile(dist_m, 90) / 1000.0)

        nodes.append(
            {
                "hours_ago": hours,
                "lat": round(centre_lat, 5),
                "lon": round(centre_lon, 5),
                "radius_km": round(max(radius_km, 1.0), 2),
            }
        )

    # The workflow explicitly calls for this sanity check.
    radii = [node["radius_km"] for node in nodes]
    if any(b < a for a, b in zip(radii, radii[1:])):
        raise ValueError(
            "Corridor radii are not monotonic; increase ensemble size or "
            "inspect perturbations."
        )

    return {
        "observed_at": contract1["observed_at"],
        "corridor": nodes,
        "field_source": field_source,
    }
