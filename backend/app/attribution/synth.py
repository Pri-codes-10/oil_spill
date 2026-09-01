"""
app/attribution/synth.py

OWNER: B3 (AIS & Attribution).

Synthetic AIS generator, NOAA-schema field names (B3_ATTRIBUTION.md §1-2), so
the same downstream code reads recorded and generated tracks and swapping in
real AIS later is free.

One guilty track that threads the corridor at a plausible lookback (aligned
heading, slows down, goes dark — the discharge signature), plus HARD decoys
that are each right in one way and wrong in another. Easy decoys make scoring
look better than it is — DECOY TIME specifically checks that the corridor's
TIME dimension is doing work; flatten the corridor to a point and it wrongly
wins.
"""

import numpy as np
from datetime import timedelta
from pyproj import Geod

GEOD = Geod(ellps="WGS84")
KN = 0.514444


def _track(mmsi, lon0, lat0, bearing_deg, speed_kn, start, hours,
           ping_seconds=180, name=None, vtype=70, gap=None, slow=None,
           rng=None):
    """Straight-line track.

    gap=(from_h, to_h)          drop pings, simulating a silent transponder
    slow=(from_h, to_h, factor) reduce speed over a window, simulating discharge
    """
    rng = rng or np.random.default_rng(0)
    n = int(hours * 3600 / ping_seconds)
    rows, lon, lat = [], lon0, lat0
    for i in range(n):
        t_h = i * ping_seconds / 3600.0
        sog = speed_kn
        if slow and slow[0] <= t_h <= slow[1]:
            sog *= slow[2]
        # Position must follow the reduced speed too, or the track teleports.
        lon, lat, _ = GEOD.fwd(lon, lat, bearing_deg, sog * KN * ping_seconds)
        if gap and gap[0] <= t_h <= gap[1]:
            continue                                  # transponder silent
        rows.append({
            "MMSI": mmsi,
            "BaseDateTime": start + timedelta(seconds=i * ping_seconds),
            "LAT": lat + rng.normal(0, 2e-5),
            "LON": lon + rng.normal(0, 2e-5),
            "SOG": max(0.0, sog + rng.normal(0, 0.25)),
            "COG": bearing_deg % 360.0,
            "Heading": bearing_deg % 360.0,
            "VesselName": name or f"SYN-{mmsi}",
            "VesselType": vtype,
        })
    return rows


def make_scenario(corridor, slick_bearing_deg, rng_seed=0):
    """Build one guilty track through the corridor plus hard decoys."""
    rng = np.random.default_rng(rng_seed)
    obs = corridor["observed_at"]
    if isinstance(obs, str):
        from app.common.timeutil import parse_iso_z
        obs = parse_iso_z(obs)

    node = corridor["corridor"][len(corridor["corridor"]) // 2]
    t_guilty = obs - timedelta(hours=node["hours_ago"])

    rows = []
    # --- guilty: aligned heading, back-offset so it crosses the node ---
    back_m = 9.0 * 3600 * 8.0 * KN
    lon_s, lat_s, _ = GEOD.fwd(node["lon"], node["lat"],
                                (slick_bearing_deg + 180) % 360, back_m)
    rows += _track(316001234, lon_s, lat_s, slick_bearing_deg, 8.0,
                    t_guilty - timedelta(hours=9), 20,
                    name="MV SYNTHETIC ALPHA",
                    slow=(9.0, 11.0, 0.35),       # throttles to ~2.8 kn AT the node
                    gap=(9.5, 11.0), rng=rng)     # and goes dark for 90 min

    # --- hard decoys: each right in ONE way, wrong in another ---
    # right place, wrong time (12 h too early)
    rows += _track(316005678, node["lon"] - 0.9, node["lat"] - 0.5,
                    slick_bearing_deg, 11.0,
                    t_guilty - timedelta(hours=12), 14, name="MV DECOY TIME", rng=rng)
    # right time, wrong place (far off corridor)
    rows += _track(316009012, node["lon"] + 1.6, node["lat"] + 1.1,
                    40.0, 12.0, t_guilty - timedelta(hours=4), 14,
                    name="MV DECOY SPACE", rng=rng)
        # right place and time, but crossing the slick axis at ~90 deg
    rows += _track(316003456, node["lon"] - 0.02, node["lat"] + 0.02,
                    (slick_bearing_deg + 90) % 360, 9.0,
                    t_guilty - timedelta(hours=1), 6,
                    name="MV DECOY CROSS", rng=rng)

    for k in range(12):                              # ambient traffic
        rows += _track(
            316100000 + k,
            node["lon"] + rng.uniform(-2.5, 2.5),
            node["lat"] + rng.uniform(-2.0, 2.0),
            rng.uniform(0, 360), rng.uniform(6, 16),
            obs - timedelta(hours=rng.uniform(2, 70)), 12, rng=rng)
    return rows
