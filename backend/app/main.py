"""
app/main.py

OWNER: B2 (integration duty, WORKFLOW.md §2 / §9).
FROZEN after day 1 (WORKFLOW.md §4.5) — register all three routers today,
even though two are stubs, then nobody touches this file again and nobody
ever merge-conflicts on it.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import ingest, drift, attribution

app = FastAPI(title="SpillTrace API")
app.add_middleware(
    CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # demo only
    allow_methods=["*"], allow_headers=["*"],
)
app.include_router(ingest.router, prefix="/api")
app.include_router(drift.router, prefix="/api")
app.include_router(attribution.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"ok": True}
