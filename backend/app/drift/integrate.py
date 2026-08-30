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

from datetime import timedelta

import numpy as np

from app.common.timeutil import parse_iso_z, utc

M_PER_DEG_LAT = 111_320.0


def _to_deg(u, v, lat):
    """m/s -> deg/s. Longitude degrees shrink with cos(latitude)."""
    dlat = v / M_PER_DEG_LAT
    dlon = u / (M_PER_DEG_LAT * np.cos(np.radians(lat)))
    return dlon, dlat


def step_rk4(field, lon, lat, when, dt, backward=True):
    """One Runge-Kutta 4 step. dt in seconds (always positive).

    `backward` negates the field AND walks `when` backwards, because those are
    two separate things: the sign flip reverses the flow, and the clock has to
    move with it so a time-varying field is sampled at the hour the parcel was
    actually there.

    Each RK4 sub-stage is evaluated at its own time -- k1 at t, k2/k3 at the
    midpoint, k4 at the end of the step. With a steady field (AnalyticField)
    this changes nothing; with a real CMEMS reader it is the difference between
    a correct hindcast and one frozen at a single hour.
    """
    s = -1.0 if backward else 1.0
    half = when + timedelta(seconds=s * 0.5 * dt)
    end = when + timedelta(seconds=s * dt)

    def f(lo, la, t):
        u, v = field.velocity(lo, la, t)
        dlon, dlat = _to_deg(s * u, s * v, la)
        return dlon, dlat

    k1x, k1y = f(lon, lat, when)
    k2x, k2y = f(lon + 0.5 * dt * k1x, lat + 0.5 * dt * k1y, half)
    k3x, k3y = f(lon + 0.5 * dt * k2x, lat + 0.5 * dt * k2y, half)
    k4x, k4y = f(lon + dt * k3x, lat + dt * k3y, end)

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

    # corridor.py hands us contract1["observed_at"], which is an ISO-8601
    # STRING, so parse before doing any arithmetic. utc() rejects naive
    # datetimes loudly rather than silently hindcasting several hours wrong.
    t0 = parse_iso_z(start_time) if isinstance(start_time, str) else utc(start_time)
    sign = -1 if backward else 1

    for i in range(1, n_steps + 1):
        # The clock ADVANCES with the integration. Passing t0 into every step
        # asks a time-varying field for one single hour across the whole
        # lookback -- invisible with AnalyticField (it ignores `when`), and a
        # silently wrong corridor the moment a real CMEMS reader is wired.
        when = t0 + timedelta(seconds=sign * (i - 1) * dt_seconds)
        lon, lat = step_rk4(field, lon, lat, when, dt_seconds, backward)
        if diffusivity > 0:
            sigma_m = np.sqrt(2.0 * diffusivity * dt_seconds)
            lat = lat + rng.normal(0, sigma_m / M_PER_DEG_LAT, lat.shape)
            lon = lon + rng.normal(
                0, sigma_m / (M_PER_DEG_LAT * np.cos(np.radians(lat))), lon.shape)
        track.append((i * dt_seconds / 3600.0, lon.copy(), lat.copy()))
    return track
