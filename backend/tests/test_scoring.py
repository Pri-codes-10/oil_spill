"""
tests/test_scoring.py

OWNER: B3 (AIS & Attribution).
Two invariants (B3_ATTRIBUTION.md §5). The second is your regression guard:
if a refactor breaks the corridor's time dimension, DECOY TIME overtakes the
guilty vessel and this test catches it.
"""

from app.attribution.score import axis_alignment
from app.attribution.synth import make_scenario
from app.attribution.funnel import to_frame
from app.attribution.rank import rank_suspects
from app.drift.corridor import build_corridor


def test_axis_is_undirected():
    """070 and 250 are the same axis -- must score identically."""
    assert abs(axis_alignment(70, 70) - axis_alignment(250, 70)) < 1e-9
    assert axis_alignment(70, 70) == 1.0
    assert axis_alignment(160, 70) == 0.0          # perpendicular


def test_guilty_vessel_outranks_hard_decoys():
    """The scenario's guilty MMSI (316001234) must come first, or scoring is
    not working. Uses the synthetic contract1 fixture below rather than a
    real detection, so this test has zero dependency on B1's chain."""
    contract1 = {
        "observed_at": "2026-03-14T05:42:11Z",
        "polygon": [[[72.60, 18.40], [72.66, 18.46], [72.70, 18.45],
                      [72.64, 18.39], [72.60, 18.40]]],
        "orientation_deg": 70.2,
    }
    corridor = build_corridor(contract1, rng_seed=1)
    df = to_frame(make_scenario(corridor, contract1["orientation_deg"], rng_seed=1))
    suspects = rank_suspects(df, corridor, contract1["orientation_deg"])

    assert suspects, "expected at least one candidate to survive the funnel"
    assert suspects[0]["mmsi"] == 316001234, (
        f"expected guilty vessel 316001234 to rank #1, got {suspects[0]['mmsi']} "
        f"({suspects[0].get('name')}) -- check match_corridor's time window "
        f"or the WEIGHTS in app/attribution/score.py"
    )
