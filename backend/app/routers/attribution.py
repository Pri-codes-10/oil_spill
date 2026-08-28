"""
app/routers/attribution.py

OWNER: B3 (AIS & Attribution) — exclusive, per WORKFLOW.md §3.

Exposes the ranked suspect list. Uses the synthetic AIS generator by default
(honest label: this validates pipeline logic only, never real-world ground
truth — WORKFLOW.md §9).
"""

from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.attribution.synth import make_scenario
from app.attribution.funnel import to_frame
from app.attribution.rank import rank_suspects

router = APIRouter(prefix="/attribution", tags=["attribution"])


class RankRequest(BaseModel):
    contract2: Dict[str, Any]
    slick_bearing_deg: float
    use_synthetic_ais: bool = True   # False once real/collected AIS is wired in


@router.post("/rank")
def rank(req: RankRequest):
    """Score AIS traffic against a corridor (Contract 2) -> ranked suspects.

    `detector`/`field_source` honesty rule extends here: the response always
    states whether AIS was synthetic, so the UI can surface it (WORKFLOW.md §9,
    "never let a demo imply real-world ground truth").
    """
    if not req.use_synthetic_ais:
        raise HTTPException(501, "real AIS source not wired in yet — see scripts/ais_collector.py")
    try:
        rows = make_scenario(req.contract2, req.slick_bearing_deg)
        df = to_frame(rows)
        suspects = rank_suspects(df, req.contract2, req.slick_bearing_deg)
        return {
            "ais_source": "synthetic",   # honesty rule — never omit this field
            "suspects": suspects,
        }
    except Exception as exc:
        raise HTTPException(500, f"attribution failed: {exc}")
