"""B3: cheap filter funnel before expensive/subjective scoring."""

from datetime import timedelta

import numpy as np
import pandas as pd
from pyproj import Geod

GEOD = Geod(ellps="WGS84")


def to_frame(rows):
    """Normalize NOAA-style AIS rows into a sorted dataframe."""
    df = pd.DataFrame(rows)

    if df.empty:
        return df

    df["BaseDateTime"] = pd.to_datetime(
        df["BaseDateTime"],
        utc=True,
    )
    return df.sort_values(
        ["MMSI", "BaseDateTime"]
    ).reset_index(drop=True)


def filter_temporal(df, observed_at, max_hours=72, pad_hours=3):
    """Stage 1: remove pings outside the allowed lookback window."""
    lower = observed_at - timedelta(hours=max_hours + pad_hours)
    return df[
        (df.BaseDateTime >= lower)
        & (df.BaseDateTime <= observed_at)
    ].copy()


def _dist_km(lon1, lat1, lon2, lat2):
    """Vectorized WGS84 geodesic distance."""
    lon1 = np.atleast_1d(lon1)
    lat1 = np.atleast_1d(lat1)

    _, _, distance_m = GEOD.inv(
        lon1,
        lat1,
        np.full_like(lon1, lon2),
        np.full_like(lat1, lat2),
    )
    return distance_m / 1000.0


def match_corridor(df, contract2, slack_km=6.0):
    """
    Stage 2: match a vessel in BOTH space and time.

    Each corridor node has its own hours_ago, so a vessel in the correct
    location at the wrong lookback is rejected.
    """
    from app.common.timeutil import parse_iso_z

    observed = contract2["observed_at"]
    if isinstance(observed, str):
        observed = parse_iso_z(observed)

    best = {}

    for node in contract2["corridor"]:
        centre_time = observed - timedelta(hours=node["hours_ago"])
        half_window = timedelta(hours=2.5)

        window = df[
            (df.BaseDateTime >= centre_time - half_window)
            & (df.BaseDateTime <= centre_time + half_window)
        ]

        if window.empty:
            continue

        distances = _dist_km(
            window["LON"].values,
            window["LAT"].values,
            node["lon"],
            node["lat"],
        )

        limit = node["radius_km"] + slack_km
        window = window.assign(
            _d=distances,
            _dn=distances / limit,
        )

        inside = window[window["_dn"] <= 1.0]

        for mmsi, group in inside.groupby("MMSI"):
            row = group.loc[group["_dn"].idxmin()]

            candidate = {
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

            # Compare normalized distance because older corridor nodes
            # intentionally have wider uncertainty radii.
            if (
                mmsi not in best
                or candidate["norm_distance"]
                < best[mmsi]["norm_distance"]
            ):
                best[mmsi] = candidate

    return list(best.values())
