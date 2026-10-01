from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping


@dataclass(frozen=True)
class Scope:
    type: str
    id: str
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProducerInfo:
    name: str
    version: str


@dataclass(frozen=True)
class IntegrityInfo:
    algorithm: str
    checksums: str | None = None


@dataclass(frozen=True)
class Consistency:
    level: str
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ResourceChunk:
    sequence: int
    path: str
    record_count: int
    uncompressed_bytes: int
    sha256: str


@dataclass(frozen=True)
class Resource:
    name: str
    schema: str | Mapping[str, Any]
    identity: tuple[str, ...]
    record_count: int
    chunks: tuple[ResourceChunk, ...]
    descriptor: str


@dataclass(frozen=True)
class AssetSummary:
    count: int
    total_bytes: int
    index: str | None = None


@dataclass(frozen=True)
class RelationshipEndpoint:
    resource: str
    pointer: str


@dataclass(frozen=True)
class Relationship:
    id: str
    from_endpoint: RelationshipEndpoint
    to_endpoint: RelationshipEndpoint
    cardinality: str
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Manifest:
    """Parsed JSON with lossless access to all fields, including future fields."""

    raw: Mapping[str, Any]

    @property
    def pasp_version(self) -> str | None:
        return self.raw.get("paspVersion")

    @property
    def package_id(self) -> str | None:
        return self.raw.get("packageId")

    @property
    def export_id(self) -> str | None:
        return self.raw.get("exportId")

    @property
    def scope(self) -> Scope | None:
        data = self.raw.get("scope")
        if not isinstance(data, dict):
            return None
        return Scope(data.get("type"), data.get("id"), data.get("metadata", {}))


@dataclass(frozen=True)
class InspectionResult:
    valid: bool
    pasp_version: str
    package_id: str
    export_id: str
    scope: Scope
    producer: ProducerInfo
    consistency: Consistency
    resources: tuple[Resource, ...]
    assets: AssetSummary
    relationship_count: int
    integrity: IntegrityInfo
    verified: bool
