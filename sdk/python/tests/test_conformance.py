from __future__ import annotations

import json
from pathlib import Path

import pytest

from openexit import PaspError, verify_bundle

ROOT = Path(__file__).resolve().parents[3]
SUITE_ROOT = ROOT / "protocol/pasp/v1/conformance"
SUITE = json.loads((SUITE_ROOT / "suite.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", SUITE["cases"], ids=lambda case: case["id"])
def test_shared_conformance(case: dict) -> None:
    bundle = SUITE_ROOT / case["path"]
    expected = case["expected"]
    if expected["valid"]:
        result = verify_bundle(bundle)
        assert result.valid and result.verified
        assert result.pasp_version == SUITE["protocolVersion"]
    else:
        with pytest.raises(PaspError) as raised:
            verify_bundle(bundle)
        assert raised.value.code == expected["errorCode"]
