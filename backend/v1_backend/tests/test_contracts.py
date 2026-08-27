"""B2/B1: basic contract-shape checks."""

import json
from pathlib import Path

from app.contracts import Contract1, Contract2


ROOT = Path(__file__).resolve().parents[1]


def test_contract1_mock():
    data = json.loads(
        (ROOT / "mocks" / "contract1.json").read_text()
    )
    model = Contract1.model_validate(data)
    assert model.crs == "EPSG:4326"
    assert model.observed_at.endswith("Z")


def test_contract2_mock():
    data = json.loads(
        (ROOT / "mocks" / "contract2.json").read_text()
    )
    model = Contract2.model_validate(data)
    assert model.field_source == "analytic"
    assert len(model.corridor) > 0
