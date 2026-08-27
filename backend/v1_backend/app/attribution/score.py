"""B3: transparent, unmerged five-factor scoring."""

import numpy as np
import pandas as pd

from app.config import ATTRIBUTION_WEIGHTS as WEIGHTS


def axis_alignment(cog_deg, slick_bearing_deg):
    """
    1.0 = parallel to slick axis, 0.0 = perpendicular.

    Slick orientation is UNDIRECTED, so 070° and 250° are equivalent.
    """
    difference = abs(
        (float(cog_deg) % 180.0)
        - (float(slick_bearing_deg) % 180.0)
    )
    difference = min(difference, 180.0 - difference)

    return float(1.0 - difference / 90.0)


def proximity(norm_distance):
    """1.0 at corridor centre, 0.0 at the filter boundary."""
    return float(
        np.clip(1.0 - float(norm_distance), 0.0, 1.0)
    )


def temporal(hours_ago, max_hours=72.0):
    """Mild preference for recent origins."""
    return (
        float(
            np.clip(
                1.0 - hours_ago / max_hours,
                0.0,
                1.0,
            )
        )
        * 0.5
        + 0.5
    )


def speed_anomaly(track, at, window_h=3.0):
    """
    Score slowdown relative to the vessel's own median SOG.

    AIS SOG is knots. Keep it as knots inside this comparison because both
    the candidate and its baseline are in the same AIS unit.
    """
    if track.empty:
        return 0.0

    median = float(track.SOG.median())

    lo = at - pd.Timedelta(hours=window_h)
    hi = at + pd.Timedelta(hours=window_h)

    near = track[
        (track.BaseDateTime >= lo)
        & (track.BaseDateTime <= hi)
    ]

    if near.empty or median <= 0:
        return 0.0

    local = float(near.SOG.median())
    slowdown = max(0.0, (median - local) / median)

    return float(np.clip(slowdown / 0.70, 0.0, 1.0))


def transponder_gap(track, at, window_h=6.0, min_gap_min=25.0):
    """Score unusually long AIS silence around the candidate time."""
    if len(track) < 2:
        return 0.0

    lo = at - pd.Timedelta(hours=window_h)
    hi = at + pd.Timedelta(hours=window_h)

    near = track[
        (track.BaseDateTime >= lo)
        & (track.BaseDateTime <= hi)
    ]

    if len(near) < 2:
        return 0.0

    gaps_min = (
        near.BaseDateTime.diff()
        .dt.total_seconds()
        .dropna()
        / 60.0
    )

    if gaps_min.empty:
        return 0.0

    worst = float(gaps_min.max())

    if worst < min_gap_min:
        return 0.0

    return float(
        np.clip(
            (worst - min_gap_min) / 90.0,
            0.0,
            1.0,
        )
    )


def score_candidate(cand, track, slick_bearing_deg):
    """Return total score AND each independent factor."""
    factors = {
        "heading_alignment": axis_alignment(
            cand["cog"],
            slick_bearing_deg,
        ),
        "proximity": proximity(cand["norm_distance"]),
        "temporal": temporal(cand["hours_ago"]),
        "speed_anomaly": speed_anomaly(
            track,
            cand["at"],
        ),
        "transponder_gap": transponder_gap(
            track,
            cand["at"],
        ),
    }

    total = sum(
        WEIGHTS[key] * value
        for key, value in factors.items()
    )

    return {
        "mmsi": cand["mmsi"],
        "name": cand.get("name"),
        "score": round(total, 4),
        "factors": {
            key: round(value, 4)
            for key, value in factors.items()
        },
        "weights": WEIGHTS,
        "fits_hours_ago": cand["hours_ago"],
        "distance_km": round(cand["distance_km"], 2),
        "matched_at": cand["at"].isoformat().replace(
            "+00:00",
            "Z",
        ),
        "evidence": (
            f"fits a {cand['hours_ago']}h-old discharge, "
            f"{cand['distance_km']:.1f} km from corridor centre"
        ),
    }
