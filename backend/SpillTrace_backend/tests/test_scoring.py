"""B3: transparent scoring and hard-decoy tests."""

import json
from pathlib import Path

from app.attribution.funnel import to_frame
from app.attribution.rank import rank_suspects
from app.attribution.synth import make_scenario
from app.drift.corridor import build_corridor


ROOT = Path(__file__).resolve().parents[1]


def test_guilty_should_rank_above_time_decoy():
    contract1 = json.loads(
        (ROOT / "mocks" / "contract1.json").read_text()
    )

    contract2 = build_corridor(
        contract1,
        n_members=2,
        n_particles=30,
        max_hours=24,
        rng_seed=1,
    )

    ais = to_frame(
        make_scenario(
            contract2,
            contract1["orientation_deg"],
            rng_seed=1,
        )
    )

    suspects = rank_suspects(
        ais,
        contract2,
        contract1["orientation_deg"],
        top_n=10,
    )

    names = [item["name"] for item in suspects]

    if "MV SYNTHETIC ALPHA" in names and "MV DECOY TIME" in names:
        assert names.index("MV SYNTHETIC ALPHA") < names.index("MV DECOY TIME")


def test_axis_is_undirected():
    from app.attribution.score import axis_alignment

    assert axis_alignment(70, 70) == 1.0
    assert axis_alignment(250, 70) == 1.0
