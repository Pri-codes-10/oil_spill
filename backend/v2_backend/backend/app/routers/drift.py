"""
app/routers/drift.py

OWNER: B2 (Drift & Metocean) — exclusive, per WORKFLOW.md §3.

Exposes CONTRACT 2 (the corridor). Falls back to mocks/corridor.json so
frontend and B3 are never blocked on a real backward run.
"""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Dict

from app.drift.corridor import build_corridor
from app.contracts import validate_contract2

router = APIRouter(prefix="/drift", tags=["drift"])

MOCK_PATH = Path(__file__).resolve().parents[2] / "mocks" / "corridor.json"


class CorridorRequest(BaseModel):
    contract1: Dict[str, Any]
    field_source: str = "analytic"   # "cmems_era5" once B2 has real readers wired in


@router.post("/corridor")
def corridor(req: CorridorRequest):
    """Backward-hindcast B1's polygon into a space-time corridor (Contract 2)."""
    try:
        c2 = build_corridor(req.contract1, field_source=req.field_source)
        validate_contract2(c2)
        return c2
    except Exception as exc:
        if MOCK_PATH.exists():
            return json.loads(MOCK_PATH.read_text())
        raise HTTPException(500, f"corridor build failed and no mock available: {exc}")


@router.get("/mock")
def mock():
    if not MOCK_PATH.exists():
        raise HTTPException(404, "run mocks/generate.py first")
    return json.loads(MOCK_PATH.read_text())
