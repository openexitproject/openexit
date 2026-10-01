from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Mapping

from .errors import PaspError
from .models import Manifest


def _reject_non_json_constant(value: str) -> None:
    raise ValueError(f"invalid JSON constant: {value}")


def parse_manifest(source: Mapping[str, Any] | os.PathLike[str] | str | bytes) -> Manifest:
    """Parse a mapping, JSON text, UTF-8 bytes, or explicit PathLike file.

    A string is always JSON text. Use pathlib.Path for filesystem input.
    Parsing does not establish protocol validity; call validate_manifest for that.
    """
    try:
        if isinstance(source, Mapping):
            value = dict(source)
        elif isinstance(source, os.PathLike):
            value = json.loads(Path(source).read_text(encoding="utf-8"), parse_constant=_reject_non_json_constant)
        elif isinstance(source, bytes):
            value = json.loads(source.decode("utf-8"), parse_constant=_reject_non_json_constant)
        elif isinstance(source, str):
            value = json.loads(source, parse_constant=_reject_non_json_constant)
        else:
            raise TypeError("manifest source must be a mapping, PathLike, JSON str, or bytes")
    except (OSError, UnicodeError, ValueError) as exc:
        raise PaspError("PASP_INVALID_MANIFEST", "cannot parse manifest JSON") from exc
    if not isinstance(value, dict):
        raise PaspError("PASP_INVALID_MANIFEST", "manifest must be a JSON object")
    return Manifest(value)
