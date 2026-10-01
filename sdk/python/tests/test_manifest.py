import json
from pathlib import Path

import pytest

from openexit import Manifest, PaspError, parse_manifest, validate_manifest

ROOT = Path(__file__).resolve().parents[3]
SAMPLE = ROOT / "protocol/pasp/v1/conformance/valid/minimal/manifest.json"


def test_parse_forms():
    text = SAMPLE.read_text(encoding="utf-8")
    data = json.loads(text)
    for source in (data, SAMPLE, text, text.encode("utf-8")):
        model = parse_manifest(source)
        assert isinstance(model, Manifest)
        assert model.package_id == "pkg-fixture"
        validate_manifest(model)


def test_invalid_json():
    with pytest.raises(PaspError) as raised:
        parse_manifest("{")
    assert raised.value.code == "PASP_INVALID_MANIFEST"


def test_missing_and_wrong_field():
    data = json.loads(SAMPLE.read_text(encoding="utf-8"))
    data.pop("packageId")
    with pytest.raises(PaspError, match="invalid manifest"):
        validate_manifest(data)
    data["packageId"] = 3
    with pytest.raises(PaspError):
        validate_manifest(data)


def test_future_field_survives_parsing_but_frozen_schema_rejects_it():
    data = json.loads(SAMPLE.read_text(encoding="utf-8"))
    data["future"] = "preserved"
    model = parse_manifest(data)
    assert model.raw["future"] == "preserved"
    with pytest.raises(PaspError) as raised:
        validate_manifest(model)
    assert raised.value.code == "PASP_INVALID_MANIFEST"


def test_unsupported_version():
    data = json.loads(SAMPLE.read_text(encoding="utf-8"))
    data["paspVersion"] = "2.0"
    with pytest.raises(PaspError) as raised:
        validate_manifest(data)
    assert raised.value.code == "PASP_UNSUPPORTED_VERSION"


def test_rfc8259_rejects_non_json_constants():
    with pytest.raises(PaspError) as raised:
        parse_manifest('{"paspVersion": NaN}')
    assert raised.value.code == "PASP_INVALID_MANIFEST"
