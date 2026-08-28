"""
app/contracts.py

OWNER: shared — FROZEN after day 1 (WORKFLOW.md §4.5 / §5).
Changing this file after day 1 needs a dedicated PR + approval from BOTH
affected parties (the producer and the consumer of that contract). B2 is the
gatekeeper for this file (integration duty).

This module defines the three interfaces the whole team's parallel work
depends on. It is intentionally dependency-free (no pydantic) so every
folder can import it without adding a shared dependency — plain dict shapes
plus a cheap assertion-based validator each, good enough for a hackathon
week and easy to read under time pressure.

    Contract 0 — ml/          -> B1   : predict(tile) -> probabilities
    Contract 1 — B1 (ingest)  -> B2   : georeferenced polygon + geometry
    Contract 2 — B2 (drift)   -> B3   : space-time corridor
"""

from __future__ import annotations


# ---------------------------------------------------------------------------
# Contract 0 — ML -> backend (see B1_INGEST.md §3)
# ---------------------------------------------------------------------------
# ml side must provide a callable with this exact signature:
#
#     predict(tile: np.ndarray[512, 512, 2]) -> np.ndarray[512, 512]  (float32, 0..1)
#
# B1's app/ingest/detect_threshold.py implements the SAME signature, so the
# chain runs before ML delivers, and swapping the real model in is one line
# (see app/ingest/pipeline.py). Both sides read normalisation constants from
# app/config.py — never hardcode them a second time.


# ---------------------------------------------------------------------------
# Contract 1 — B1 (ingest) -> B2 (drift)
# ---------------------------------------------------------------------------

CONTRACT1_REQUIRED_KEYS = {
    "observed_at", "crs", "polygon", "area_km2", "major_axis_km",
    "minor_axis_km", "orientation_deg", "centroid", "confidence", "detector",
}


def validate_contract1(d: dict) -> None:
    """Cheap shape check. Raises AssertionError with a useful message.

    `observed_at` is load-bearing (WORKFLOW.md §5) — without it B2 cannot
    know how many hours of drift to undo, and the chain cannot run at all.
    """
    missing = CONTRACT1_REQUIRED_KEYS - d.keys()
    assert not missing, f"contract1 missing keys: {missing}"
    assert isinstance(d["observed_at"], str) and d["observed_at"].endswith("Z"), \
        "observed_at must be an ISO-8601 UTC string ending in 'Z' — use app.common.timeutil.iso_z"
    assert d["detector"] in ("threshold", "unet"), \
        f"detector must be 'threshold' or 'unet', got {d['detector']!r}"
    assert 0.0 <= d["confidence"] <= 1.0
    lo, hi = d["orientation_deg"], d["orientation_deg"]
    assert 0.0 <= lo < 180.0, "orientation_deg must be mod 180 — an axis has no direction"


# ---------------------------------------------------------------------------
# Contract 2 — B2 (drift) -> B3 (attribution)      ⚠️ corridor, not a point
# ---------------------------------------------------------------------------
# Superseded design note (WORKFLOW.md §5): earlier drafts described this as a
# single centroid + radius. THIS corridor version is the current contract.
# A vessel must match in BOTH position and time — that joint constraint is
# what separates "the origin" from "a sighting."

CONTRACT2_REQUIRED_KEYS = {"observed_at", "corridor", "field_source"}
CORRIDOR_NODE_REQUIRED_KEYS = {"hours_ago", "lat", "lon", "radius_km"}


def validate_contract2(d: dict) -> None:
    missing = CONTRACT2_REQUIRED_KEYS - d.keys()
    assert not missing, f"contract2 missing keys: {missing}"
    assert d["field_source"] in ("analytic", "cmems_era5"), \
        f"field_source must be 'analytic' or 'cmems_era5', got {d['field_source']!r}"
    assert len(d["corridor"]) >= 2, "corridor needs at least 2 nodes to be useful"

    radii = []
    hours = []
    for node in d["corridor"]:
        node_missing = CORRIDOR_NODE_REQUIRED_KEYS - node.keys()
        assert not node_missing, f"corridor node missing keys: {node_missing}"
        radii.append(node["radius_km"])
        hours.append(node["hours_ago"])

    assert hours == sorted(hours), "corridor nodes must be ordered by hours_ago ascending"
    assert radii == sorted(radii), (
        "radius_km must grow monotonically with hours_ago — if it doesn't, the "
        "backward ensemble is broken (too small, or perturbations too narrow). "
        "See B2_DRIFT.md §5 and the assert in scripts/run_chain.py."
    )
