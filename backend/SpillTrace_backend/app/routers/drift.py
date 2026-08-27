"""B2-owned drift API router."""

from fastapi import APIRouter

from app.drift.corridor import build_corridor

router = APIRouter()


@router.get("/health")
def health():
    return {"owner": "B2", "stage": "drift", "status": "ok"}


@router.post("/corridor")
def corridor(contract1: dict):
    """Build Contract 2 from a B1 Contract 1 payload."""
    return build_corridor(contract1)
