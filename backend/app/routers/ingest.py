"""
app/routers/ingest.py

OWNER: B1 (Ingest & Geospatial) — exclusive, per WORKFLOW.md §3 ("one router
file per person is deliberate: three people add endpoints all week without
ever touching the same file").

Exposes CONTRACT 1. Falls back to mocks/polygon.json if the real chain isn't
ready yet — this is what lets frontend build against real JSON on day 1
(WORKFLOW.md §1, "publish mock responses" obligation).
"""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.ingest.pipeline import detect_scene
from app.contracts import validate_contract1

router = APIRouter(prefix="/ingest", tags=["ingest"])

MOCK_PATH = Path(__file__).resolve().parents[2] / "mocks" / "polygon.json"


class DetectRequest(BaseModel):
    scene_path: str = "synthetic"   # pass a real SAFE path once B1 has one


@router.post("/detect")
def detect(req: DetectRequest):
    """Run B1's chain: SAFE product -> polygon + geometry (Contract 1)."""
    try:
        c1 = detect_scene(req.scene_path)
        validate_contract1(c1)
        return c1
    except Exception as exc:
        # day-1 safety net: never block frontend/B2 on a half-built detector
        if MOCK_PATH.exists():
            return json.loads(MOCK_PATH.read_text())
        raise HTTPException(500, f"detection failed and no mock available: {exc}")


@router.get("/mock")
def mock():
    """Always returns the frozen mock — useful for frontend smoke tests."""
    if not MOCK_PATH.exists():
        raise HTTPException(404, "run mocks/generate.py first")
    return json.loads(MOCK_PATH.read_text())
