"""
tests/test_contracts.py

OWNER: B2 (integration duty — schema conformance).
Guards the two frozen interfaces (app/contracts.py) that the whole team's
parallel work depends on. Run this after ANY change near contracts.py,
geometry.py, or corridor.py — a silent shape drift here breaks B1<->B2 or
B2<->B3 without anyone noticing until integration day.
"""

import json
import pathlib

import pytest

from app.contracts import validate_contract1, validate_contract2

MOCKS = pathlib.Path(__file__).resolve().parents[1] / "mocks"


def test_mock_polygon_matches_contract1():
    path = MOCKS / "polygon.json"
    if not path.exists():
        pytest.skip("run mocks/generate.py first")
    validate_contract1(json.loads(path.read_text()))


def test_mock_corridor_matches_contract2():
    path = MOCKS / "corridor.json"
    if not path.exists():
        pytest.skip("run mocks/generate.py first")
    validate_contract2(json.loads(path.read_text()))


def test_corridor_radius_grows_monotonically():
    """Same assertion run_chain.py makes live — duplicated here so CI catches
    a broken ensemble even if nobody runs the chain script that day."""
    path = MOCKS / "corridor.json"
    if not path.exists():
        pytest.skip("run mocks/generate.py first")
    corridor = json.loads(path.read_text())["corridor"]
    radii = [n["radius_km"] for n in corridor]
    assert radii == sorted(radii)
