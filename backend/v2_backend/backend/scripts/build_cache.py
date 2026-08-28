"""
scripts/build_cache.py

OWNER: B3 (demo cache duty — WORKFLOW.md §2, §7).
Venue wifi is shared and unreliable, and a 90-second wait is where a judge's
attention drains away. Precompute 2-3 scenes by day 6 so frontend loads
instantly at the venue. `cache/` is gitignored — commit this script, not the
output.

Usage:
    python scripts/build_cache.py demo_scene_1 synthetic
    python scripts/build_cache.py demo_scene_2 /path/to/another.SAFE
"""

import json
import pathlib
import sys

from app.ingest.pipeline import detect_scene
from app.drift.corridor import build_corridor
from app.attribution.synth import make_scenario
from app.attribution.funnel import to_frame
from app.attribution.rank import rank_suspects

CACHE = pathlib.Path(__file__).resolve().parents[1] / "cache"


def build(scene_id, safe_path):
    d = CACHE / scene_id
    d.mkdir(parents=True, exist_ok=True)

    c1 = detect_scene(safe_path)
    c2 = build_corridor(c1)
    df = to_frame(make_scenario(c2, c1["orientation_deg"]))
    sus = rank_suspects(df, c2, c1["orientation_deg"])

    (d / "polygon.json").write_text(json.dumps(c1, indent=2))
    (d / "corridor.json").write_text(json.dumps(c2, indent=2))
    (d / "suspects.json").write_text(json.dumps(sus, indent=2))
    df.to_json(d / "ais.json", orient="records", date_format="iso")
    print(f"cached {scene_id}: {len(sus)} suspects, top={sus[0]['mmsi'] if sus else None}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python scripts/build_cache.py <scene_id> <safe_path|synthetic>")
        sys.exit(1)
    build(sys.argv[1], sys.argv[2])
