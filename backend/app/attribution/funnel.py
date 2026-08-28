"""
app/attribution/funnel.py

OWNER: B3 (AIS & Attribution).

Cheap-and-hard filtering BEFORE expensive-and-soft scoring
(B3_ATTRIBUTION.md §3): first drop anything outside the lookback window
(stage 1, temporal), then keep only vessels matching a corridor node in BOTH
space and time (stage 2). This is the heart of attribution — a vessel in the
right place at the wrong lookback is excluded.
"""

import numpy as np
import pandas as pd
from datetime import timedelta
from pyproj import Geod

from app.config import CORRIDOR_MATCH_SLACK_KM, CORRIDOR_MATCH_HALF_WINDOW_HOURS

GEOD = Geod(ellps="WGS84")


def to_frame(rows):
    df = pd.DataFrame(rows)
    df["BaseDateTime"] = pd.to_datetime(df["BaseDateTime"], utc=True)
    return df.sort_values(["MMSI", "BaseDateTime"]).reset_index(drop=True)


def filter_temporal(df, observed_at, max_hours=72, pad_hours=3):
    """Stage 1: drop anything outside the lookback window. Cheap, decisive."""
    lo = observed_at - timedelta(hours=max_hours + pad_hours)
    return df[(df.BaseDateTime >= lo) & (df.BaseDateTime <= observed_at)].copy()


def _dist_km(lon1, lat1, lon2, lat2):
    lon1 = np.atleast_1d(lon1)
    lat1 = np.atleast_1d(lat1)
    _, _, d = GEOD.inv(lon1, lat1,
                        np.full_like(lon1, lon2), np.full_like(lat1, lat2))
    return d / 1000.0


def match_corridor(df, contract2, slack_km=CORRIDOR_MATCH_SLACK_KM):
    """Stage 2: keep vessels matching a corridor node in BOTH space and time.

    For each node we look only at pings near that node's own hours_ago, then
    ask whether the vessel was inside its radius. A ship in the right place
    at the wrong lookback is rejected.
    """
    obs = contract2["observed_at"]
    if isinstance(obs, str):
        from app.common.timeutil import parse_iso_z
        obs = parse_iso_z(obs)

    best = {}
    for node in contract2["corridor"]:
        centre = obs - timedelta(hours=node["hours_ago"])
        half = timedelta(hours=CORRIDOR_MATCH_HALF_WINDOW_HOURS)
        win = df[(df.BaseDateTime >= centre - half) &
                 (df.BaseDateTime <= centre + half)]
        if win.empty:
            continue
        d = _dist_km(win["LON"].values, win["LAT"].values,
                      node["lon"], node["lat"])
        lim = node["radius_km"] + slack_km
        win = win.assign(_d=d, _dn=d / lim)          # _dn = normalised distance
        inside = win[win["_dn"] <= 1.0]
        for mmsi, grp in inside.groupby("MMSI"):
            row = grp.loc[grp["_dn"].idxmin()]
            cand = {
                "mmsi": int(mmsi),
                "hours_ago": node["hours_ago"],
                "distance_km": float(row["_d"]),
                "norm_distance": float(row["_dn"]),
                "radius_km": node["radius_km"],
                "cog": float(row["COG"]),
                "sog": float(row["SOG"]),
                "at": row["BaseDateTime"],
                "name": row.get("VesselName"),
            }
            # Compare NORMALISED distance, not raw km — corridor radius grows
            # with hours_ago, so raw km would always prefer the newest node.
            if mmsi not in best or cand["norm_distance"] < best[mmsi]["norm_distance"]:
                best[mmsi] = cand
    return list(best.values())
