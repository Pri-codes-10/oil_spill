"""
B2 owns application assembly.

This file registers the three person-specific routers once.
After day 1, treat it as frozen except for agreed integration changes.
"""

from fastapi import FastAPI

from app.routers.attribution import router as attribution_router
from app.routers.drift import router as drift_router
from app.routers.ingest import router as ingest_router

app = FastAPI(
    title="SpillTrace Backend",
    version="0.1.0",
    description="Satellite oil-spill detection, drift hindcast and vessel attribution.",
)

# B2 integration duty: register all routers here.
app.include_router(ingest_router, prefix="/api/ingest", tags=["B1 Ingest"])
app.include_router(drift_router, prefix="/api/drift", tags=["B2 Drift"])
app.include_router(attribution_router, prefix="/api/attribution", tags=["B3 Attribution"])


@app.get("/health")
def health():
    """Simple health endpoint for the frontend/demo."""
    return {"status": "ok", "service": "spilltrace-backend"}


@app.get("/analyse")
def analyse_mock():
    """
    Day-1 frontend contract.

    This is intentionally small and deterministic so frontend work can start
    before the real processing chain is finished.
    """
    return {
        "status": "mock",
        "message": "Replace this response with the full chain once integration is ready.",
        "observed_at": "2026-03-14T05:42:11Z",
        "detector": "threshold",
        "field_source": "analytic",
        "suspects": [],
    }
