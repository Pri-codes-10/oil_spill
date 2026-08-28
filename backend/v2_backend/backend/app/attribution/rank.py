"""
app/attribution/rank.py

OWNER: B3 (AIS & Attribution).

Orchestrator: filter funnel -> score every surviving candidate -> sort.
Lives here (not in score.py) because B2's scripts/run_chain.py already
imports `from app.attribution.rank import rank_suspects` — the name and path
are fixed by an existing caller, do not rename.

Ships `factors` and `weights` in every response — the breakdown IS the
product (see score.py docstring): it lets frontend draw a bar per factor and
lets a human analyst overrule the ranking intelligently.
"""

from app.attribution.funnel import filter_temporal, match_corridor
from app.attribution.score import score_candidate
from app.common.timeutil import parse_iso_z


def rank_suspects(df, contract2, slick_bearing_deg, top_n=5):
    obs = contract2["observed_at"]
    obs = parse_iso_z(obs) if isinstance(obs, str) else obs

    windowed = filter_temporal(df, obs)
    cands = match_corridor(windowed, contract2)

    out = []
    for c in cands:
        track = windowed[windowed.MMSI == c["mmsi"]]
        out.append(score_candidate(c, track, slick_bearing_deg))
    out.sort(key=lambda r: r["score"], reverse=True)

    for i, r in enumerate(out, 1):
        r["rank"] = i
    return out[:top_n]
