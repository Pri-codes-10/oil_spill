"""
scripts/run_chain.py

OWNER: B2 (integration duty — WORKFLOW.md §2, §9).
Run this EVERY DAY and report the result in standup: does the chain still
run, what is still a mock, what broke since yesterday. Demonstrate, don't
describe.

Usage:
    python scripts/run_chain.py synthetic
    python scripts/run_chain.py /path/to/S1A_..._.SAFE
"""

import sys
import time

from app.ingest.pipeline import detect_scene         # B1
from app.drift.corridor import build_corridor         # B2 (you)
from app.attribution.rank import rank_suspects        # B3
from app.attribution.synth import make_scenario       # B3
from app.attribution.funnel import to_frame           # B3


def main(scene):
    t0 = time.time()
    c1 = detect_scene(scene)
    print(f"[1] polygon  area={c1['area_km2']} km2  bearing={c1['orientation_deg']}")

    c2 = build_corridor(c1)
    radii = [n["radius_km"] for n in c2["corridor"]]
    assert radii == sorted(radii), f"radius must grow with lookback: {radii}"
    print(f"[2] corridor nodes={len(c2['corridor'])} src={c2['field_source']}")

    # Attribution needs three things, not just the corridor: the AIS frame, the
    # corridor, and the slick axis bearing from Contract 1. Threading them
    # together is what integration duty means in practice.
    ais = to_frame(make_scenario(c2, c1["orientation_deg"]))
    sus = rank_suspects(ais, c2, c1["orientation_deg"])
    print(f"[3] suspects={len(sus)} top={sus[0]['mmsi'] if sus else None}")

    print(f"OK in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    scene_arg = sys.argv[1] if len(sys.argv) > 1 else "synthetic"
    main(scene_arg)
