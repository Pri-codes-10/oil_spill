"""
B2-owned integration smoke test.

Runs the backend chain with synthetic inputs:
Contract 1 -> corridor -> synthetic AIS -> ranked suspects.

Run:
    python scripts/run_chain.py
"""

import json
import sys
import time
from pathlib import Path

# Make `app` importable when running this file directly.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.attribution.rank import rank_suspects
from app.attribution.synth import make_scenario
from app.attribution.funnel import to_frame
from app.drift.corridor import build_corridor


def main():
    t0 = time.time()

    contract1 = json.loads(
        (ROOT / "mocks" / "contract1.json").read_text()
    )

    print("[1] Contract 1 loaded")

    contract2 = build_corridor(
        contract1,
        field_source="analytic",
        n_members=4,
        n_particles=80,
        max_hours=72,
        rng_seed=7,
    )

    print(
        f"[2] corridor nodes={len(contract2['corridor'])} "
        f"source={contract2['field_source']}"
    )

    ais = to_frame(
        make_scenario(
            contract2,
            contract1["orientation_deg"],
            rng_seed=7,
        )
    )

    suspects = rank_suspects(
        ais,
        contract2,
        contract1["orientation_deg"],
        top_n=5,
    )

    top = suspects[0]["mmsi"] if suspects else None
    print(f"[3] suspects={len(suspects)} top={top}")
    print(f"OK in {time.time() - t0:.1f}s")

    # Useful local inspection without writing generated JSON into git.
    if suspects:
        print("\nTop suspect:")
        print(json.dumps(suspects[0], indent=2, default=str))


if __name__ == "__main__":
    main()
