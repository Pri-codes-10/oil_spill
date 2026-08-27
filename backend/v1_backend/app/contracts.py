"""
Shared B1 -> B2 -> B3 contracts.

FREEZE THIS FILE AFTER DAY 1.

The actual ML model is outside this repository/folder. It provides the same
predict(tile) interface as B1's threshold fallback.
"""

from typing import Any

from pydantic import BaseModel, Field


class Contract1(BaseModel):
    """B1 -> B2: georeferenced slick polygon and observation metadata."""

    observed_at: str
    crs: str = "EPSG:4326"
    polygon: Any
    area_km2: float
    major_axis_km: float
    minor_axis_km: float
    orientation_deg: float
    centroid: list[float]
    confidence: float = Field(ge=0.0, le=1.0)
    detector: str


class CorridorNode(BaseModel):
    hours_ago: float
    lat: float
    lon: float
    radius_km: float


class Contract2(BaseModel):
    """B2 -> B3: space-time corridor, NOT a single origin point."""

    observed_at: str
    corridor: list[CorridorNode]
    field_source: str
