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

if __name__ == "__main__":
    out = pathlib.Path(__file__).parent
    for name, obj in [("polygon", polygon), ("corridor", corridor)]:
        path = out / f"{name}.json"
        path.write_text(json.dumps(obj, indent=2))
        print(f"wrote {path}")
