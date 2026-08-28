"""
app/drift/integrate.py

OWNER: B2 (Drift & Metocean).

Backward RK4 integrator, zero external deps, zero OpenDrift API risk
(B2_DRIFT.md §0 "the decision that de-risks your whole week" — write this
before touching OpenDrift; OpenDrift becomes a day-5 upgrade, not a
dependency that can sink the week).

Use RK4, not Euler — Euler's error accumulates badly over a 72-hour
integration and RK4 costs nothing extra here.

What this CANNOT do: un-diffuse. Spreading has a deterministic part
(advection, reversible) and a stochastic part (turbulent diffusion, NOT
reversible). Running backward never contracts the cloud to a point — that is
why we take an ensemble SPREAD as the uncertainty, not a single line
(see app/drift/corridor.py).
"""

import numpy as np

M_PER_DEG_LAT = 111_320.0


def _to_deg(u, v, lat):
    """m/s -> deg/s. Longitude degrees shrink with cos(latitude)."""
    dlat = v / M_PER_DEG_LAT
    dlon = u / (M_PER_DEG_LAT * np.cos(np.radians(lat)))
    return dlon, dlat


def step_rk4(field, lon, lat, when, dt, backward=True):
    """One Runge-Kutta 4 step. dt in seconds. backward negates the field."""
    s = -1.0 if backward else 1.0

    def f(lo, la):
        u, v = field.velocity(lo, la, when)
        dlon, dlat = _to_deg(s * u, s * v, la)
        return dlon, dlat

    k1x, k1y = f(lon, lat)
    k2x, k2y = f(lon + 0.5 * dt * k1x, lat + 0.5 * dt * k1y)
    k3x, k3y = f(lon + 0.5 * dt * k2x, lat + 0.5 * dt * k2y)
    k4x, k4y = f(lon + dt * k3x, lat + dt * k3y)

    lon = lon + (dt / 6.0) * (k1x + 2 * k2x + 2 * k3x + k4x)
    lat = lat + (dt / 6.0) * (k1y + 2 * k2y + 2 * k3y + k4y)
    return lon, lat


def advect(field, lon, lat, start_time, hours, dt_seconds=900,
           backward=True, diffusivity=0.0, rng=None):
    """Integrate a particle cloud for `hours`, sampling the path.

    Returns list of (hours_elapsed, lon_array, lat_array).
    diffusivity (m^2/s) adds a random walk -- use it to widen the ensemble,
    and remember it is NOT reversible, so it only ever grows the cloud.
    """
    rng = rng or np.random.default_rng(0)
    lon = np.asarray(lon, dtype="float64").copy()
    lat = np.asarray(lat, dtype="float64").copy()
    n_steps = int(hours * 3600 / dt_seconds)
    track = [(0.0, lon.copy(), lat.copy())]

    for i in range(1, n_steps + 1):
        lon, lat = step_rk4(field, lon, lat, start_time, dt_seconds, backward)
        if diffusivity > 0:
            sigma_m = np.sqrt(2.0 * diffusivity * dt_seconds)
            lat = lat + rng.normal(0, sigma_m / M_PER_DEG_LAT, lat.shape)
            lon = lon + rng.normal(
                0, sigma_m / (M_PER_DEG_LAT * np.cos(np.radians(lat))), lon.shape)
        track.append((i * dt_seconds / 3600.0, lon.copy(), lat.copy()))
    return track
