from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterator

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError, ValidationError
from referencing import Registry
from referencing.exceptions import NoSuchResource, Unresolvable

from .errors import PaspError
from .integrity import verify_file, hash_file
from .manifest import parse_manifest, _reject_non_json_constant
from .models import (AssetSummary, Consistency, InspectionResult, IntegrityInfo,
                     ProducerInfo, Resource, ResourceChunk, Scope)
from .paths import safe_package_path
from .validation import validate_document, validate_manifest


def _json_file(path: Path, code: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"), parse_constant=_reject_non_json_constant)
    except (OSError, UnicodeError, ValueError) as exc:
        raise PaspError(code, f"invalid or missing JSON file: {path}") from exc


def _lines(path: Path, code: str) -> Iterator[tuple[int, Any]]:
    try:
        with path.open("r", encoding="utf-8") as stream:
            for number, line in enumerate(stream, 1):
                if not line.strip():
                    continue
                try:
                    yield number, json.loads(line, parse_constant=_reject_non_json_constant)
                except ValueError as exc:
                    raise PaspError(code, f"invalid NDJSON at {path}:{number}") from exc
    except (OSError, UnicodeError) as exc:
        raise PaspError(code, f"cannot read NDJSON: {path}") from exc


def _no_external_schema(uri: str):
    raise NoSuchResource(ref=uri)


def _schema_for_resource(root: Path, descriptor: dict[str, Any]) -> dict[str, Any]:
    schema = descriptor["schema"]
    if isinstance(schema, str):
        schema_path = safe_package_path(root, schema)
        if not schema_path.is_file():
            raise PaspError("PASP_MISSING_SCHEMA", f"missing schema: {schema}")
        schema = _json_file(schema_path, "PASP_MISSING_SCHEMA")
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as exc:
        raise PaspError("PASP_INVALID_RESOURCE", "invalid record schema") from exc
    return schema


def _resource(root: Path, entry: dict[str, Any], deep: bool) -> Resource:
    name = entry["name"]
    descriptor_path = safe_package_path(root, entry["descriptor"])
    descriptor = _json_file(descriptor_path, "PASP_INVALID_RESOURCE")
    validate_document("resource", descriptor, "PASP_INVALID_RESOURCE")
    if descriptor["name"] != name:
        raise PaspError("PASP_INVALID_RESOURCE", f"descriptor name mismatch: {name}")
    schema = _schema_for_resource(root, descriptor)
    chunks = []
    total_records = 0
    for index, raw in enumerate(descriptor["chunks"], 1):
        sequence = raw["sequence"]
        if sequence != index or raw["path"] != f"resources/{name}/{index:08d}.ndjson":
            raise PaspError("PASP_INVALID_RESOURCE", f"invalid chunk order/path: {name}")
        chunk_path = safe_package_path(root, raw["path"])
        if not chunk_path.is_file():
            raise PaspError("PASP_INVALID_RESOURCE", f"missing chunk: {raw['path']}")
        if deep:
            verify_file(chunk_path, raw["sha256"], raw["uncompressedBytes"])
            validator = Draft202012Validator(schema, format_checker=FormatChecker(), registry=Registry(retrieve=_no_external_schema))
            count = 0
            for line_number, record in _lines(chunk_path, "PASP_INVALID_RECORD"):
                if not isinstance(record, dict):
                    raise PaspError("PASP_INVALID_RECORD", f"record is not an object at {raw['path']}:{line_number}")
                if any(identity not in record for identity in descriptor["identity"]):
                    raise PaspError("PASP_INVALID_RECORD", f"missing identity at {raw['path']}:{line_number}")
                try:
                    validator.validate(record)
                except (ValidationError, Unresolvable) as exc:
                    raise PaspError("PASP_INVALID_RECORD", f"record schema failure at {raw['path']}:{line_number}: {exc}") from exc
                count += 1
            if count != raw["recordCount"]:
                raise PaspError("PASP_INVALID_RESOURCE", f"chunk record count mismatch: {raw['path']}")
        total_records += raw["recordCount"]
        chunks.append(ResourceChunk(raw["sequence"], raw["path"], raw["recordCount"], raw["uncompressedBytes"], raw["sha256"]))
    if total_records != descriptor["recordCount"]:
        raise PaspError("PASP_INVALID_RESOURCE", f"resource record count mismatch: {name}")
    return Resource(name, descriptor["schema"], tuple(descriptor["identity"]), descriptor["recordCount"], tuple(chunks), entry["descriptor"])


def _assets(root: Path, raw: dict[str, Any], deep: bool) -> AssetSummary:
    summary = AssetSummary(raw["count"], raw["totalBytes"], raw.get("index"))
    if summary.count == 0 and summary.index is None:
        return summary
    index_path = safe_package_path(root, summary.index or "assets/index.ndjson")
    if not index_path.is_file():
        raise PaspError("PASP_MISSING_ASSET", "missing asset index")
    count = total_bytes = 0
    for _, asset in _lines(index_path, "PASP_MISSING_ASSET"):
        validate_document("asset", asset, "PASP_MISSING_ASSET")
        asset_path = safe_package_path(root, asset["path"])
        if not asset_path.is_file():
            raise PaspError("PASP_MISSING_ASSET", f"missing asset: {asset['path']}")
        if deep:
            verify_file(asset_path, asset["sha256"], asset["byteLength"])
        count += 1
        total_bytes += asset["byteLength"]
    if count != summary.count or total_bytes != summary.total_bytes:
        raise PaspError("PASP_MISSING_ASSET", "asset summary mismatch")
    return summary


def _relationships(root: Path, reference: str | None, names: set[str]) -> int:
    if reference is None:
        return 0
    rel_path = safe_package_path(root, reference)
    items = _json_file(rel_path, "PASP_INVALID_RELATIONSHIP")
    if not isinstance(items, list):
        raise PaspError("PASP_INVALID_RELATIONSHIP", "relationships must be an array")
    for item in items:
        validate_document("relationship", item, "PASP_INVALID_RELATIONSHIP")
        if item["from"]["resource"] not in names or item["to"]["resource"] not in names:
            raise PaspError("PASP_INVALID_RELATIONSHIP", "relationship endpoint resource is missing")
    return len(items)


def _checksum_index(root: Path, reference: str | None) -> None:
    if reference is None:
        return
    index = safe_package_path(root, reference)
    try:
        with index.open("r", encoding="utf-8") as stream:
            for number, line in enumerate(stream, 1):
                if not line.strip():
                    continue
                parts = line.rstrip("\r\n").split(maxsplit=1)
                if len(parts) != 2 or len(parts[0]) != 64 or any(c not in "0123456789abcdef" for c in parts[0]):
                    raise PaspError("PASP_MALFORMED_PACKAGE", f"invalid checksums index line {number}")
                entry = safe_package_path(root, parts[1].lstrip())
                if not entry.is_file():
                    raise PaspError("PASP_MALFORMED_PACKAGE", f"missing checksummed file: {parts[1]}")
                actual, _ = hash_file(entry)
                if actual != parts[0]:
                    raise PaspError("PASP_CHECKSUM_MISMATCH", f"checksum index mismatch: {parts[1]}")
    except (OSError, UnicodeError) as exc:
        raise PaspError("PASP_MALFORMED_PACKAGE", "cannot read checksums index") from exc


def _inspect(directory: str | Path, deep: bool) -> InspectionResult:
    root = Path(directory)
    if not root.is_dir():
        raise PaspError("PASP_MALFORMED_PACKAGE", f"not a PASP directory: {root}")
    manifest_path = safe_package_path(root, "manifest.json")
    if not manifest_path.is_file():
        raise PaspError("PASP_MALFORMED_PACKAGE", "missing manifest.json")
    manifest = parse_manifest(manifest_path)
    validate_manifest(manifest)
    value = dict(manifest.raw)
    names = {entry["name"] for entry in value["resources"]}
    resources = tuple(_resource(root, entry, deep) for entry in value["resources"])
    assets = _assets(root, value["assets"], deep)
    relationships = _relationships(root, value.get("relationships"), names)
    if deep:
        _checksum_index(root, value["integrity"].get("checksums"))
    return InspectionResult(
        True, value["paspVersion"], value["packageId"], value["exportId"],
        Scope(**value["scope"]), ProducerInfo(**value["producer"]),
        Consistency(**value["consistency"]), resources, assets, relationships,
        IntegrityInfo(**value["integrity"]), deep,
    )


def inspect_bundle(directory: str | Path) -> InspectionResult:
    """Inspect a directory bundle using metadata and streamed asset index."""
    return _inspect(directory, False)


def verify_bundle(directory: str | Path) -> InspectionResult:
    """Verify a directory bundle, hashing bytes and streaming records."""
    return _inspect(directory, True)


