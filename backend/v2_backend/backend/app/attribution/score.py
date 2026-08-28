"""
app/attribution/score.py

OWNER: B3 (AIS & Attribution).

Five-factor scoring, kept UNMERGED on purpose (B3_ATTRIBUTION.md §0, §4):
"Transparency is the deliverable, not the score." This is a shortlisting
tool for a human investigator, not a verdict machine — every factor stays
separately visible so an analyst can see WHY a vessel ranked where it did.

WEIGHTS lives in exactly one dict, in exactly one file (this one). Never
scatter magic numbers through the scoring functions — a judge may ask to see
them, and tuning is easier with one source of truth.
"""

import numpy as np
import pandas as pd

# Judgment, not measurement. Documented here so it is auditable and tunable.
# If you change a value, say so in the commit body (WORKFLOW.md / B3 §9) —
# weight changes alter the ranking and B2/frontend may be looking at a stale
# screenshot.
WEIGHTS = {
    "heading_alignment": 0.30,   # strongest physical signal
    "proximity":         0.25,
    "temporal":          0.20,
    "speed_anomaly":     0.15,
    "transponder_gap":   0.10,
}


def axis_alignment(cog_deg, slick_bearing_deg):
    """1.0 = vessel course parallel to the slick axis, 0.0 = perpendicular.

    A slick axis is UNDIRECTED, so fold into 0-90 deg. B1 gives bearing mod
    180; a ship steaming 070 and one steaming 250 lie on the same axis.
    """
    d = abs((float(cog_deg) % 180.0) - (float(slick_bearing_deg) % 180.0))
    d = min(d, 180.0 - d)                     # -> 0..90
    return float(1.0 - d / 90.0)


def proximity(norm_distance):
    """1.0 at the corridor centre, 0.0 at the filter's own boundary.

    Takes the NORMALISED distance the funnel already computed, so the filter
    and the score share one definition of "too far".
    """
    return float(np.clip(1.0 - float(norm_distance), 0.0, 1.0))


def temporal(hours_ago, max_hours=72.0):
    """Mild preference for recent origins: less drift, so less uncertainty."""
    return float(np.clip(1.0 - hours_ago / max_hours, 0.0, 1.0)) * 0.5 + 0.5


def speed_anomaly(track, at, window_h=3.0):
    """Slowing relative to the vessel's OWN median — not a global threshold.

    Discharge often happens at reduced speed. Comparing a vessel to itself
    avoids penalising slow ship types.
    """
    if track.empty:
        return 0.0
    med = float(track.SOG.median())
    if med <= 0.5:
        return 0.0
    lo = at - pd.Timedelta(hours=window_h)
    hi = at + pd.Timedelta(hours=window_h)
    near = track[(track.BaseDateTime >= lo) & (track.BaseDateTime <= hi)]
    if near.empty:
        return 0.0
    drop = (med - float(near.SOG.min())) / med
    return float(np.clip(drop, 0.0, 1.0))


def transponder_gap(track, at, window_h=6.0, min_gap_min=25.0):
    """Score AIS silence around the candidate time. Going dark is a known tell."""
    if len(track) < 2:
        return 0.0
    lo = at - pd.Timedelta(hours=window_h)
    hi = at + pd.Timedelta(hours=window_h)
    near = track[(track.BaseDateTime >= lo) & (track.BaseDateTime <= hi)]
    if len(near) < 2:
        return 0.0
    gaps_min = near.BaseDateTime.diff().dt.total_seconds().dropna() / 60.0
    if gaps_min.empty:
        return 0.0
    worst = float(gaps_min.max())
    if worst < min_gap_min:
        return 0.0
    return float(np.clip((worst - min_gap_min) / 90.0, 0.0, 1.0))


def score_candidate(cand, track, slick_bearing_deg):
    f = {
        "heading_alignment": axis_alignment(cand["cog"], slick_bearing_deg),
        "proximity":         proximity(cand["norm_distance"]),
        "temporal":          temporal(cand["hours_ago"]),
        "speed_anomaly":     speed_anomaly(track, cand["at"]),
        "transponder_gap":   transponder_gap(track, cand["at"]),
    }
    total = sum(WEIGHTS[k] * v for k, v in f.items())
    return {
        "mmsi": cand["mmsi"],
        "name": cand.get("name"),
        "score": round(total, 4),
        "factors": {k: round(v, 4) for k, v in f.items()},
        "weights": WEIGHTS,
        "fits_hours_ago": cand["hours_ago"],
        "distance_km": round(cand["distance_km"], 2),
        "matched_at": cand["at"].isoformat().replace("+00:00", "Z"),
        "evidence": (f"fits a {cand['hours_ago']}h-old discharge, "
                     f"{cand['distance_km']:.1f} km from corridor centre"),
    }
