"""
mocks/generate.py

OWNER: all three on day 1, then frozen (WORKFLOW.md §7).
Run this ONCE on day 1, commit the resulting JSON, and tell frontend the
file paths. Two frontend people are blocked until they have JSON to build
against — this is the single most time-critical thing backend does all week.

Run:  python mocks/generate.py
"""

import json
import pathlib
from datetime import datetime, timezone

OBS = datetime(2026, 3, 14, 5, 42, 11, tzinfo=timezone.utc)

polygon = {
    "observed_at": OBS.isoformat().replace("+00:00", "Z"),
    "crs": "EPSG:4326",
    "polygon": [[[72.60, 18.40], [72.66, 18.46], [72.70, 18.45],
                 [72.64, 18.39], [72.60, 18.40]]],
    "area_km2": 12.4, "major_axis_km": 8.1, "minor_axis_km": 1.9,
    "orientation_deg": 70.2, "centroid": [72.65, 18.43],
    "confidence": 0.87, "detector": "threshold",
}

corridor = {
    "observed_at": polygon["observed_at"],
    "corridor": [
        {"hours_ago": 6,  "lat": 18.47, "lon": 72.55, "radius_km": 4.2},
        {"hours_ago": 12, "lat": 18.55, "lon": 72.48, "radius_km": 8.1},
        {"hours_ago": 24, "lat": 18.79, "lon": 72.19, "radius_km": 17.6},
    ],
    "field_source": "analytic",
}

# ---------------------------------------------------------------------------
# Suspect list — the response shape of POST /api/attribution/rank.
# ---------------------------------------------------------------------------
# Field names, and the five factor/weight keys, are copied from real
# rank_suspects() output so frontend never builds against a shape that
# changes on integration day.
#
# The guilty vessel plus the three decoys are all listed deliberately: a
# ranked list with one row does not exercise a ranking UI. The decoys are the
# point of the design — each is right in exactly ONE way, so the per-factor
# breakdown is what separates them, not the total.
#
# `weights` is repeated on every suspect on purpose: the UI should render the
# contribution of each factor, and that is the explainability story. Never
# show only the total score.
WEIGHTS = {
    "heading_alignment": 0.30,
    "proximity": 0.25,
    "temporal": 0.20,
    "speed_anomaly": 0.15,
    "transponder_gap": 0.10,
}

suspects = {
    # NOT "synthetic" and NOT "real" — this is a hand-written fixture. The
    # live endpoint returns ais_source="synthetic"; keeping a third value here
    # means a mock can never be mistaken for a pipeline result.
    "ais_source": "mock",
    "corridor_field_source": corridor["field_source"],
    "suspects": [
        {
            "mmsi": 316001234, "name": "MV SYNTHETIC ALPHA", "score": 0.9109,
            "factors": {"heading_alignment": 1.0, "proximity": 0.9691,
                        "temporal": 0.9167, "speed_anomaly": 0.7094,
                        "transponder_gap": 0.7889},
            "weights": WEIGHTS, "fits_hours_ago": 12, "distance_km": 0.44,
            "matched_at": "2026-03-13T17:39:11Z",
            "evidence": "fits a 12h-old discharge, 0.4 km from corridor centre",
            "rank": 1,
        },
        {
            # Right place, 12 h too early. Ranks second on position alone —
            # flatten the corridor to a single point and this wrongly wins.
            "mmsi": 316007777, "name": "MV DECOY TIME", "score": 0.5423,
            "factors": {"heading_alignment": 0.9210, "proximity": 0.8874,
                        "temporal": 0.0000, "speed_anomaly": 0.3011,
                        "transponder_gap": 0.0000},
            "weights": WEIGHTS, "fits_hours_ago": 24, "distance_km": 2.10,
            "matched_at": "2026-03-13T05:41:00Z",
            "evidence": "on the axis but 12 h outside the corridor's time window",
            "rank": 2,
        },
        {
            # Right place and time, crossing the slick axis at ~90 deg.
            "mmsi": 316009999, "name": "MV DECOY CROSS", "score": 0.3556,
            "factors": {"heading_alignment": 0.0400, "proximity": 0.9120,
                        "temporal": 0.8830, "speed_anomaly": 0.0000,
                        "transponder_gap": 0.0000},
            "weights": WEIGHTS, "fits_hours_ago": 12, "distance_km": 1.65,
            "matched_at": "2026-03-13T17:52:40Z",
            "evidence": "in the corridor at the right time but crossing the slick axis",
            "rank": 3,
        },
    ],
}

if __name__ == "__main__":
    out = pathlib.Path(__file__).parent
    for name, obj in [("polygon", polygon), ("corridor", corridor),
                      ("suspects", suspects)]:
        path = out / f"{name}.json"
        path.write_text(json.dumps(obj, indent=2))
        print(f"wrote {path}")
