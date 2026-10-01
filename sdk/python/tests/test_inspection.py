import json
import shutil
from pathlib import Path

import pytest

from openexit import PaspError, inspect_bundle, verify_bundle

ROOT = Path(__file__).resolve().parents[3]
VALID = ROOT / "protocol/pasp/v1/conformance/valid"


def test_metadata_and_deep_verification():
    info = inspect_bundle(VALID / "multiple-chunks")
    assert info.valid and not info.verified
    assert info.package_id == "pkg-fixture"
    assert info.scope.type == "organization"
    assert len(info.resources) == 1
    assert len(info.resources[0].chunks) == 2
    assert info.resources[0].record_count == 4
    assert verify_bundle(VALID / "multiple-chunks").verified


def test_assets_and_relationships():
    assert inspect_bundle(VALID / "assets").assets.count == 1
    assert inspect_bundle(VALID / "assets").assets.total_bytes == 11
    assert inspect_bundle(VALID / "relationships").relationship_count == 1
    assert len(inspect_bundle(VALID / "multiple-resources").resources) == 2


def test_unicode_record_values():
    assert verify_bundle(VALID / "unicode").resources[0].record_count == 1


def test_canonical_schema_rejects_zero_based_chunk_sequence(tmp_path):
    bundle = tmp_path / "zero.pasp"
    shutil.copytree(VALID / "minimal", bundle)
    resource_dir = bundle / "resources/users"
    (resource_dir / "00000001.ndjson").rename(resource_dir / "00000000.ndjson")
    descriptor_path = resource_dir / "resource.json"
    descriptor = json.loads(descriptor_path.read_text(encoding="utf-8"))
    descriptor["chunks"][0]["sequence"] = 0
    descriptor["chunks"][0]["path"] = "resources/users/00000000.ndjson"
    descriptor_path.write_text(json.dumps(descriptor), encoding="utf-8")
    with pytest.raises(PaspError) as raised:
        verify_bundle(bundle)
    assert raised.value.code == "PASP_INVALID_RESOURCE"


def test_untrusted_record_schema_cannot_fetch_remote_refs(tmp_path):
    bundle = tmp_path / "remote-ref.pasp"
    shutil.copytree(VALID / "minimal", bundle)
    descriptor_path = bundle / "resources/users/resource.json"
    descriptor = json.loads(descriptor_path.read_text(encoding="utf-8"))
    descriptor["schema"] = {"$ref": "https://example.invalid/external.schema.json"}
    descriptor_path.write_text(json.dumps(descriptor), encoding="utf-8")
    with pytest.raises(PaspError) as raised:
        verify_bundle(bundle)
    assert raised.value.code == "PASP_INVALID_RECORD"


