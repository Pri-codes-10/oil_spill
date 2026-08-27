"""B3-owned attribution API router."""

from fastapi import APIRouter

from app.attribution.funnel import to_frame
from app.attribution.rank import rank_suspects

router = APIRouter()


@router.get("/health")
def health():
    return {"owner": "B3", "stage": "attribution", "status": "ok"}


@router.post("/rank")
def rank(payload: dict):
    """
    Rank supplied AIS rows against a Contract 2 corridor.

    Expected payload:
    {
      "ais": [... NOAA-schema rows ...],
      "contract2": {...},
      "slick_bearing_deg": 70.2,
      "top_n": 5
    }
    """
    df = to_frame(payload.get("ais", []))

    return {
        "suspects": rank_suspects(
            df,
            payload["contract2"],
            payload["slick_bearing_deg"],
            payload.get("top_n", 5),
        )
    }
