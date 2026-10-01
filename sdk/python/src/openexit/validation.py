from __future__ import annotations

import json
from functools import lru_cache
from importlib import resources
from typing import Any, Mapping

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError, ValidationError
from referencing import Registry, Resource

from .constants import PASP_VERSION
from .errors import PaspError
from .manifest import parse_manifest
from .models import Manifest
from .paths import validate_package_path


@lru_cache(maxsize=None)
def load_schema(name: str) -> dict[str, Any]:
    """Load a canonical PASP schema bundled with the installed wheel."""
    if name not in {"manifest", "scope", "resource", "resource-chunk", "asset", "relationship", "checkpoint", "event", "inspection-result"}:
        raise ValueError(f"unknown PASP schema: {name}")
    resource = resources.files("openexit.schemas").joinpath(f"{name}.schema.json")
    return json.loads(resource.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _registry() -> Registry:
    registry = Registry()
    for name in ("manifest", "scope", "resource", "resource-chunk", "asset", "relationship", "checkpoint", "event", "inspection-result"):
        schema = load_schema(name)
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
    return registry


def validate_document(name: str, value: Any, code: str) -> None:
    try:
        schema = load_schema(name)
        Draft202012Validator(schema, registry=_registry(), format_checker=FormatChecker()).validate(value)
    except (ValidationError, SchemaError) as exc:
        raise PaspError(code, f"invalid {name}: {exc.message}") from exc


def validate_manifest(manifest: Manifest | Mapping[str, Any]) -> None:
    """Validate PASP 1.0 manifest against the packaged canonical JSON Schema."""
    value = manifest.raw if isinstance(manifest, Manifest) else manifest
    if not isinstance(value, Mapping):
        raise PaspError("PASP_INVALID_MANIFEST", "manifest must be an object")
    version = value.get("paspVersion")
    if isinstance(version, str) and version != PASP_VERSION:
        raise PaspError("PASP_UNSUPPORTED_VERSION", f"unsupported PASP version: {version}")
    entries = value.get("resources")
    if isinstance(entries, list):
        seen: set[str] = set()
        import re
        for entry in entries:
            if not isinstance(entry, dict) or not isinstance(entry.get("name"), str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", entry["name"]):
                raise PaspError("PASP_INVALID_RESOURCE", "invalid resource name")
            if entry["name"] in seen:
                raise PaspError("PASP_DUPLICATE_RESOURCE", f"duplicate resource: {entry['name']}")
            seen.add(entry["name"])
            if isinstance(entry.get("descriptor"), str):
                validate_package_path(entry["descriptor"])
    validate_document("manifest", dict(value), "PASP_INVALID_MANIFEST")
