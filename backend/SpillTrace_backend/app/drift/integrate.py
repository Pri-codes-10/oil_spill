"""B2: RK4 backward particle integration."""

import numpy as np

M_PER_DEG_LAT = 111_320.0


def _to_deg(u, v, lat):
    """Convert m/s to lon/lat degrees per second."""
    dlat = v / M_PER_DEG_LAT
    dlon = u / (M_PER_DEG_LAT * np.cos(np.radians(lat)))
    return dlon, dlat


def step_rk4(field, lon, lat, when, dt, backward=True):
    """One RK4 step. Backward integration negates the velocity."""
    sign = -1.0 if backward else 1.0

    def f(lo, la):
        u, v = field.velocity(lo, la, when)
        return _to_deg(sign * u, sign * v, la)

    k1x, k1y = f(lon, lat)
    k2x, k2y = f(lon + 0.5 * dt * k1x, lat + 0.5 * dt * k1y)
    k3x, k3y = f(lon + 0.5 * dt * k2x, lat + 0.5 * dt * k2y)
    k4x, k4y = f(lon + dt * k3x, lat + dt * k3y)

    lon = lon + (dt / 6.0) * (k1x + 2 * k2x + 2 * k3x + k4x)
    lat = lat + (dt / 6.0) * (k1y + 2 * k2y + 2 * k3y + k4y)

    return lon, lat


def advect(
    field,
    lon,
    lat,
    start_time,
    hours,
    dt_seconds=900,
    backward=True,
    diffusivity=0.0,
    rng=None,
):
    """
    Integrate a particle cloud.

    Diffusion is stochastic and therefore not physically reversible; it is
    used only to widen an uncertainty ensemble.
    """
    rng = rng or np.random.default_rng(0)

    lon = np.asarray(lon, dtype="float64").copy()
    lat = np.asarray(lat, dtype="float64").copy()

    n_steps = int(hours * 3600 / dt_seconds)
    track = [(0.0, lon.copy(), lat.copy())]

    for i in range(1, n_steps + 1):
        lon, lat = step_rk4(
            field,
            lon,
            lat,
            start_time,
            dt_seconds,
            backward=backward,
        )

        if diffusivity > 0:
            sigma_m = np.sqrt(2.0 * diffusivity * dt_seconds)
            lat = lat + rng.normal(
                0,
                sigma_m / M_PER_DEG_LAT,
                lat.shape,
            )
            lon = lon + rng.normal(
                0,
                sigma_m / (
                    M_PER_DEG_LAT * np.cos(np.radians(lat))
                ),
                lon.shape,
            )

        track.append(
            (i * dt_seconds / 3600.0, lon.copy(), lat.copy())
        )

    return track
