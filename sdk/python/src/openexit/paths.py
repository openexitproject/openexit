from __future__ import annotations

import re
from pathlib import Path, PurePosixPath

from .errors import PaspError


def validate_package_path(value: str) -> None:
    """Reject unsafe protocol paths before any native filesystem access."""
    if (not isinstance(value, str) or not value or "\x00" in value or "\\" in value
            or value.startswith(("/", "~")) or re.match(r"^[A-Za-z]:", value)
            or any(part in ("", ".", "..") for part in value.split("/"))):
        raise PaspError("PASP_PATH_TRAVERSAL", f"unsafe package path: {value}")
    return None


def safe_package_path(root: Path, value: str) -> Path:
    """Resolve a PASP relative path without native-OS path ambiguity."""
    validate_package_path(value)
    root_real = root.resolve()
    candidate = root_real.joinpath(*PurePosixPath(value).parts)
    try:
        candidate.resolve().relative_to(root_real)
    except ValueError as exc:
        raise PaspError("PASP_PATH_TRAVERSAL", f"path escapes package: {value}") from exc
    return candidate
