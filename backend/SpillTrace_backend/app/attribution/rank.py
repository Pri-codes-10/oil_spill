"""B3: attribution orchestrator. Keep orchestration out of score.py."""

from app.attribution.funnel import (
    filter_temporal,
    match_corridor,
)
from app.attribution.score import score_candidate


def rank_suspects(
    df,
    contract2,
    slick_bearing_deg,
    top_n=5,
):
    """
    Filter first, score second, then rank.

    This is intentionally separate from the individual scoring functions so
    each factor remains auditable.
    """
    from app.common.timeutil import parse_iso_z

    observed = contract2["observed_at"]
    observed = (
        parse_iso_z(observed)
        if isinstance(observed, str)
        else observed
    )

    windowed = filter_temporal(df, observed)
    candidates = match_corridor(windowed, contract2)

    results = []

    for candidate in candidates:
        track = windowed[
            windowed.MMSI == candidate["mmsi"]
        ]

        results.append(
            score_candidate(
                candidate,
                track,
                slick_bearing_deg,
            )
        )

    results.sort(
        key=lambda item: item["score"],
        reverse=True,
    )

    for rank, result in enumerate(results, 1):
        result["rank"] = rank

    return results[:top_n]
