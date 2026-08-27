"""B3: deterministic NOAA-schema synthetic AIS with hard decoys."""

from datetime import timedelta

import numpy as np
from pyproj import Geod

GEOD = Geod(ellps="WGS84")
KNOT_TO_MPS = 0.514444


def _track(
    mmsi,
    lon0,
    lat0,
    bearing_deg,
    speed_kn,
    start,
    hours,
    ping_seconds=180,
    name=None,
    vtype=70,
    gap=None,
    slow=None,
    rng=None,
):
    """
    Straight-line synthetic track.

    gap=(from_h,to_h) simulates a silent transponder.
    slow=(from_h,to_h,factor) simulates a discharge-like slowdown.
    """
    rng = rng or np.random.default_rng(0)
    n = int(hours * 3600 / ping_seconds)

    rows = []
    lon, lat = lon0, lat0

    for i in range(n):
        elapsed_h = i * ping_seconds / 3600.0
        sog = speed_kn

        if slow and slow[0] <= elapsed_h <= slow[1]:
            sog *= slow[2]

        # Position uses the reduced speed too; otherwise the vessel teleports.
        lon, lat, _ = GEOD.fwd(
            lon,
            lat,
            bearing_deg,
            sog * KNOT_TO_MPS * ping_seconds,
        )

        if gap and gap[0] <= elapsed_h <= gap[1]:
            continue

        rows.append(
            {
                "MMSI": mmsi,
                "BaseDateTime": start + timedelta(seconds=i * ping_seconds),
                "LAT": lat + rng.normal(0, 2e-5),
                "LON": lon + rng.normal(0, 2e-5),
                "SOG": max(0.0, sog + rng.normal(0, 0.25)),
                "COG": bearing_deg % 360.0,
                "Heading": bearing_deg % 360.0,
                "VesselName": name or f"SYN-{mmsi}",
                "VesselType": vtype,
            }
        )

    return rows


def make_scenario(corridor, slick_bearing_deg, rng_seed=0):
    """
    Build one guilty vessel plus hard decoys and ambient traffic.

    The decoys are deliberately correct in one dimension and wrong in another.
    """
    rng = np.random.default_rng(rng_seed)
    observed = corridor["observed_at"]

    from app.common.timeutil import parse_iso_z
    if isinstance(observed, str):
        observed = parse_iso_z(observed)

    node = corridor["corridor"][len(corridor["corridor"]) // 2]
    guilty_time = observed - timedelta(hours=node["hours_ago"])

    rows = []

    # Guilty vessel: aligned, slows down, and goes dark.
    back_m = 9.0 * 3600 * 8.0 * KNOT_TO_MPS
    start_lon, start_lat, _ = GEOD.fwd(
        node["lon"],
        node["lat"],
        (slick_bearing_deg + 180) % 360,
        back_m,
    )

    rows += _track(
        316001234,
        start_lon,
        start_lat,
        slick_bearing_deg,
        8.0,
        guilty_time - timedelta(hours=9),
        20,
        name="MV SYNTHETIC ALPHA",
        slow=(9.0, 11.0, 0.35),
        gap=(9.5, 11.0),
        rng=rng,
    )

    # Right place, wrong time.
    rows += _track(
        316005678,
        node["lon"] - 0.9,
        node["lat"] - 0.5,
        slick_bearing_deg,
        11.0,
        guilty_time - timedelta(hours=12),
        14,
        name="MV DECOY TIME",
        rng=rng,
    )

    # Right time, wrong place.
    rows += _track(
        316009012,
        node["lon"] + 1.6,
        node["lat"] + 1.1,
        40.0,
        12.0,
        guilty_time - timedelta(hours=4),
        14,
        name="MV DECOY SPACE",
        rng=rng,
    )

    # Right place/time, wrong heading.
    rows += _track(
        316003456,
        node["lon"] - 0.3,
        node["lat"] + 0.4,
        (slick_bearing_deg + 90) % 360,
        9.0,
        guilty_time - timedelta(hours=5),
        14,
        name="MV DECOY CROSS",
        rng=rng,
    )

    # Ambient traffic.
    for k in range(12):
        rows += _track(
            316100000 + k,
            node["lon"] + rng.uniform(-2.5, 2.5),
            node["lat"] + rng.uniform(-2.0, 2.0),
            rng.uniform(0, 360),
            rng.uniform(6, 16),
            observed - timedelta(hours=rng.uniform(2, 70)),
            12,
            rng=rng,
        )

    return rows
