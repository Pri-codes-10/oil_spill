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
import shutil
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.ingest.pipeline import detect_scene_for_frontend
from app.contracts import validate_contract1

router = APIRouter(prefix="/ingest", tags=["ingest"])

MOCK_PATH = Path(__file__).resolve().parents[2] / "mocks" / "polygon.json"


class DetectRequest(BaseModel):
    scene_path: str = "synthetic"   # pass a real SAFE path once B1 has one


@router.post("/detect")
def detect(req: DetectRequest):
    """Run B1's chain: SAFE product -> polygon + geometry (Contract 1)."""
    try:
        c1 = detect_scene_for_frontend(req.scene_path)
        validate_contract1(c1)
        return c1
    except Exception as exc:
        # day-1 safety net: never block frontend/B2 on a half-built detector
        if MOCK_PATH.exists():
            return json.loads(MOCK_PATH.read_text())
        raise HTTPException(500, f"detection failed and no mock available: {exc}")


@router.post("/upload")
def upload(file: UploadFile = File(...)):
    """Accept a frontend file upload and run the B1 detector on it."""
    filename = Path(file.filename or "upload.bin").name
    suffix = Path(filename).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".tif", ".tiff", ".zip", ".safe"}:
        raise HTTPException(415, "supported uploads are .jpg, .jpeg, .tif, .tiff, .zip, or .SAFE")

    try:
        with tempfile.TemporaryDirectory(prefix="spilltrace-") as temp_dir:
            upload_path = Path(temp_dir) / filename
            with upload_path.open("wb") as destination:
                shutil.copyfileobj(file.file, destination)

            scene_path = upload_path
            if suffix == ".zip":
                extract_dir = Path(temp_dir) / "extracted"
                extract_dir.mkdir()
                with zipfile.ZipFile(upload_path) as archive:
                    root = extract_dir.resolve()
                    for member in archive.infolist():
                        target = (extract_dir / member.filename).resolve()
                        if root not in target.parents and target != root:
                            raise HTTPException(400, "archive contains an unsafe path")
                    archive.extractall(extract_dir)

                safe_products = list(extract_dir.glob("*.SAFE"))
                scene_path = safe_products[0] if safe_products else extract_dir

            c1 = detect_scene_for_frontend(str(scene_path))
            validate_contract1(c1)
            return c1
    except HTTPException:
        raise
    except Exception as exc:
        if MOCK_PATH.exists():
            return json.loads(MOCK_PATH.read_text())
        raise HTTPException(500, f"uploaded detection failed: {exc}") from exc


@router.get("/mock")
def mock():
    """Always returns the frozen mock — useful for frontend smoke tests."""
    if not MOCK_PATH.exists():
        raise HTTPException(404, "run mocks/generate.py first")
    return json.loads(MOCK_PATH.read_text())
