from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .inspection import inspect_bundle, verify_bundle
from .models import InspectionResult


@dataclass(frozen=True)
class Bundle:
    """A small optional handle for a PASP directory bundle."""

    path: Path

    @classmethod
    def open(cls, path: str | Path) -> Bundle:
        return cls(Path(path))

    def inspect(self) -> InspectionResult:
        return inspect_bundle(self.path)

    def verify(self) -> InspectionResult:
        return verify_bundle(self.path)
