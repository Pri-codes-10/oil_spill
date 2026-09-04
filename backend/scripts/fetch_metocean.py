"""
scripts/fetch_metocean.py

OWNER: B2 (Drift & Metocean).

Downloads a CMEMS currents + ERA5 wind subset for one Contract 1 and caches
it under METOCEAN_CACHE_DIR. app/drift/field_real.py only ever reads these
local files -- it never calls the network during a request, so a slow or
flaky CDS/CMEMS response can't block POST /api/drift/corridor.

Run this once per real scene, before asking for field_source="cmems_era5":

    python scripts/fetch_metocean.py mocks/polygon.json

Two things this is NOT trying to solve:
  - It does not retry forever. copernicusmarine and cdsapi already retry
    transient errors internally; a hard failure here means something is
    actually wrong (bad credentials, bad bbox, dataset down).
  - It does not cache across overlapping requests. Every call re-downloads.
    Re-running for the same contract1 is cheap enough (a few MB) that a
    content-addressed cache would be complexity this project doesn't need.

⚠️ ERA5 has a real availability lag -- observed empirically at ~5 days behind
"now" (CDS error: "None of the data you have requested is available yet").
CMEMS currents have no such gap (confirmed up to the current day). So a
polygon whose 72h lookback falls inside that gap CAN download currents but
NOT wind. This script fails loudly in that case rather than silently
skipping wind -- see _fetch_era5_wind below.
"""

import calendar
import json
import sys
from datetime import timedelta
from pathlib import Path

import copernicusmarine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.common.timeutil import parse_iso_z, iso_z
from app.config import (
    MAX_LOOKBACK_HOURS, METOCEAN_CACHE_DIR,
    METOCEAN_BBOX_PAD_DEG, METOCEAN_TIME_PAD_HOURS,
)

CURRENTS_DATASET_ID = "cmems_mod_glo_phy_anfc_merged-uv_PT1H-i"
CACHE_DIR = Path(__file__).resolve().parents[1] / METOCEAN_CACHE_DIR


def _bbox_from_polygon(polygon, pad_deg=METOCEAN_BBOX_PAD_DEG):
    """(min_lon, max_lon, min_lat, max_lat), padded for drift beyond the slick."""
    rings = polygon[0] if isinstance(polygon[0][0], (list, tuple)) else polygon
    lons = [pt[0] for pt in rings]
    lats = [pt[1] for pt in rings]
    return (min(lons) - pad_deg, max(lons) + pad_deg,
            min(lats) - pad_deg, max(lats) + pad_deg)


def _cache_key(contract1):
    """One directory per (observed_at, bbox) -- deterministic, human-readable."""
    observed_at = contract1["observed_at"].replace(":", "").replace("-", "")
    min_lon, max_lon, min_lat, max_lat = _bbox_from_polygon(contract1["polygon"])
    return f"{observed_at}_{min_lon:.2f}_{max_lon:.2f}_{min_lat:.2f}_{max_lat:.2f}"


def _time_window(contract1):
    """The corridor sweeps backward from observed_at; pad both ends for RK4
    sub-stages and interpolation slack at the boundary."""
    t1 = parse_iso_z(contract1["observed_at"])
    t0 = t1 - timedelta(hours=MAX_LOOKBACK_HOURS) - timedelta(hours=METOCEAN_TIME_PAD_HOURS)
    t1 = t1 + timedelta(hours=METOCEAN_TIME_PAD_HOURS)
    return t0, t1


def fetch_currents(contract1, out_dir):
    """CMEMS uo/vo, hourly, surface. No availability lag observed up to today."""
    min_lon, max_lon, min_lat, max_lat = _bbox_from_polygon(contract1["polygon"])
    t0, t1 = _time_window(contract1)

    copernicusmarine.subset(
        dataset_id=CURRENTS_DATASET_ID,
        variables=["uo", "vo"],
        minimum_longitude=min_lon, maximum_longitude=max_lon,
        minimum_latitude=min_lat, maximum_latitude=max_lat,
        start_datetime=iso_z(t0), end_datetime=iso_z(t1),
        output_directory=str(out_dir), output_filename="currents.nc",
        disable_progress_bar=True, overwrite=True,
    )


def _month_groups(t0, t1):
    """Split [t0, t1] into (year, month, [day,...]) groups.

    CDS's request cross-products year x month x day x time, so mixing two
    months in one call invents combinations that don't exist (e.g. day=31
    with month=09). One request per calendar month keeps every combination
    real.
    """
    groups = []
    cur = t0.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    while cur <= t1:
        last_day = calendar.monthrange(cur.year, cur.month)[1]
        days = [d for d in range(1, last_day + 1)
                if t0.date() <= cur.replace(day=d).date() <= t1.date()]
        if days:
            groups.append((cur.year, cur.month, days))
        if cur.month == 12:
            cur = cur.replace(year=cur.year + 1, month=1)
        else:
            cur = cur.replace(month=cur.month + 1)
    return groups


def fetch_wind(contract1, out_dir):
    """ERA5 u10/v10, hourly.

    Raises RuntimeError with the CDS message intact if the window falls
    inside ERA5's availability lag -- do NOT catch this and fall back to
    analytic wind silently; that is exactly the honesty violation
    metocean.py's docstring exists to prevent.
    """
    import cdsapi
    import xarray as xr

    min_lon, max_lon, min_lat, max_lat = _bbox_from_polygon(contract1["polygon"])
    t0, t1 = _time_window(contract1)
    area = [max_lat, min_lon, min_lat, max_lon]  # CDS order: N, W, S, E

    client = cdsapi.Client()
    parts = []
    for year, month, days in _month_groups(t0, t1):
        request = {
            "product_type": ["reanalysis"],
            "variable": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
            "year": [f"{year:04d}"],
            "month": [f"{month:02d}"],
            "day": [f"{d:02d}" for d in days],
            "time": [f"{h:02d}:00" for h in range(24)],
            "data_format": "netcdf",
            "area": area,
        }
        part_path = out_dir / f"_wind_part_{year:04d}{month:02d}.nc"
        try:
            client.retrieve("reanalysis-era5-single-levels", request).download(str(part_path))
        except Exception as exc:
            raise RuntimeError(
                f"ERA5 wind fetch failed for {year:04d}-{month:02d}: {exc}\n"
                f"If this says data is 'not available yet', the window "
                f"{iso_z(t0)}..{iso_z(t1)} falls inside ERA5's real "
                f"availability lag (observed ~5 days behind present). "
                f"field_source='cmems_era5' cannot honestly serve this "
                f"request -- see fetch_metocean.py's module docstring."
            ) from exc
        parts.append(xr.open_dataset(part_path))

    combined = xr.concat(parts, dim="valid_time") if len(parts) > 1 else parts[0]
    combined.to_netcdf(out_dir / "wind.nc")
    for p in parts:
        p.close()
    for f in out_dir.glob("_wind_part_*.nc"):
        f.unlink()


def fetch(contract1_path):
    contract1 = json.loads(Path(contract1_path).read_text())
    key = _cache_key(contract1)
    out_dir = CACHE_DIR / key
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"fetching CMEMS currents -> {out_dir / 'currents.nc'}")
    fetch_currents(contract1, out_dir)

    print(f"fetching ERA5 wind -> {out_dir / 'wind.nc'}")
    fetch_wind(contract1, out_dir)

    (out_dir / "contract1.json").write_text(json.dumps(contract1, indent=2))
    print(f"done: {out_dir}")
    return out_dir


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python scripts/fetch_metocean.py <contract1.json>")
        sys.exit(1)
    fetch(sys.argv[1])
