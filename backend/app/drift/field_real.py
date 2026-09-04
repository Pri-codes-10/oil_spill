"""
app/drift/field_real.py

OWNER: B2 (Drift & Metocean).

Real CMEMS current + ERA5 wind field, read from local files that
scripts/fetch_metocean.py downloaded ahead of time. This is the day-5
upgrade path AnalyticField's docstring and metocean.py's PLANNED set point
at.

Deliberately reads local files only -- never calls copernicusmarine or
cdsapi during a request. A live network call here would block
POST /api/drift/corridor for however long CDS/CMEMS take to respond
(measured 10-30s for a single small ERA5 request), which is not something a
synchronous API request should wait on.

Interpolation uses scipy.RegularGridInterpolator, not xarray's .interp().
Both give identical results (verified against xarray output), but
RegularGridInterpolator is ~40x faster per call once built -- with 8 ensemble
members x ~288 RK4 sub-stage evaluations (72h / 15min steps x4 per step),
xarray's per-call overhead adds up to nearly a minute; scipy keeps the same
workload under 2 seconds.
"""

from pathlib import Path

import numpy as np
import xarray as xr
from scipy.interpolate import RegularGridInterpolator

from app.config import WIND_DRIFT_FACTOR_MIN, WIND_DRIFT_FACTOR_MAX


def _to_epoch_seconds(times):
    return times.astype("datetime64[s]").astype("int64")


def _when_to_epoch_seconds(when, n):
    """A tz-aware datetime -> an array of int64 epoch seconds, one per particle.

    np.datetime64 on a tz-aware datetime silently uses the LOCAL wall-clock
    value with the tz dropped in newer numpy -- strip tzinfo explicitly after
    converting to UTC so this can never depend on numpy's own behaviour here.
    """
    naive_utc = when.astimezone(__import__("datetime").timezone.utc).replace(tzinfo=None)
    stamp = np.datetime64(naive_utc).astype("datetime64[s]").astype("int64")
    return np.full(n, stamp, dtype="int64")


class RealField:
    """Reads uo/vo (CMEMS) and u10/v10 (ERA5) from a cache dir built by
    scripts/fetch_metocean.py. wind_factor is still perturbed per ensemble
    member -- the current itself is real data, so there is nothing to
    perturb there (see the day-5 ensemble-spread decision in drift-readme).
    """

    def __init__(self, cache_dir, wind_factor):
        cache_dir = Path(cache_dir)
        currents_path = cache_dir / "currents.nc"
        wind_path = cache_dir / "wind.nc"
        if not currents_path.exists() or not wind_path.exists():
            raise FileNotFoundError(
                f"metocean cache incomplete at {cache_dir} -- run "
                f"scripts/fetch_metocean.py for this contract1 first"
            )

        cur = xr.open_dataset(currents_path)
        if "depth" in cur.dims:
            cur = cur.isel(depth=0)
        cur = cur.load()
        wind = xr.open_dataset(wind_path).load()

        self._cur_times = _to_epoch_seconds(cur["time"].values)
        self._uo = RegularGridInterpolator(
            (self._cur_times, cur["latitude"].values, cur["longitude"].values),
            cur["uo"].values, method="linear", bounds_error=False, fill_value=np.nan,
        )
        self._vo = RegularGridInterpolator(
            (self._cur_times, cur["latitude"].values, cur["longitude"].values),
            cur["vo"].values, method="linear", bounds_error=False, fill_value=np.nan,
        )

        wind_time_dim = "valid_time" if "valid_time" in wind.dims else "time"
        wind_lat = wind["latitude"].values
        wind_lon = wind["longitude"].values
        wind_u10 = wind["u10"].values
        wind_v10 = wind["v10"].values
        # ERA5's latitude often comes back DESCENDING (90 -> -90). scipy's
        # RegularGridInterpolator requires strictly ascending grid axes.
        if wind_lat[0] > wind_lat[-1]:
            wind_lat = wind_lat[::-1]
            wind_u10 = wind_u10[:, ::-1, :]
            wind_v10 = wind_v10[:, ::-1, :]
        self._wind_times = _to_epoch_seconds(wind[wind_time_dim].values)
        self._u10 = RegularGridInterpolator(
            (self._wind_times, wind_lat, wind_lon),
            wind_u10, method="linear", bounds_error=False, fill_value=np.nan,
        )
        self._v10 = RegularGridInterpolator(
            (self._wind_times, wind_lat, wind_lon),
            wind_v10, method="linear", bounds_error=False, fill_value=np.nan,
        )

        self.wind_factor = wind_factor
        cur.close()
        wind.close()

    def velocity(self, lon, lat, when):
        lon = np.asarray(lon, dtype="float64")
        lat = np.asarray(lat, dtype="float64")
        n = lat.shape[0] if lat.shape else 1
        t = _when_to_epoch_seconds(when, n)

        pts = np.column_stack([t, lat, lon])
        u = self._uo(pts) + self.wind_factor * self._u10(pts)
        v = self._vo(pts) + self.wind_factor * self._v10(pts)

        if np.isnan(u).any() or np.isnan(v).any():
            raise ValueError(
                f"real field has no data at when={when!r} for one or more "
                f"particle positions -- the request has drifted outside the "
                f"cached bbox/time window. Re-run scripts/fetch_metocean.py "
                f"with a wider METOCEAN_BBOX_PAD_DEG or check MAX_LOOKBACK_HOURS."
            )
        return u, v
