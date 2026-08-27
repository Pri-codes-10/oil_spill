"""B1-owned API router."""

from fastapi import APIRouter

from app.ingest.safe import parse_safe_name

router = APIRouter()


@router.get("/health")
def health():
    return {"owner": "B1", "stage": "ingest", "status": "ok"}


@router.post("/parse-safe")
def parse_safe(filename: str):
    """
    Small metadata endpoint.

    The real processing endpoint can later accept an uploaded SAFE path/object.
    """
    return parse_safe_name(filename)
