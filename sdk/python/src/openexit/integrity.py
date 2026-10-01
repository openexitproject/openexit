from __future__ import annotations

import hashlib
from pathlib import Path

from .errors import PaspError


def hash_file(path: Path) -> tuple[str, int]:
    """Hash a file in bounded blocks and return (lowercase SHA-256, byte count)."""
    digest = hashlib.sha256()
    count = 0
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            digest.update(block)
            count += len(block)
    return digest.hexdigest(), count


def verify_file(path: Path, sha256: str, byte_length: int) -> None:
    actual_hash, actual_length = hash_file(path)
    if actual_hash != sha256 or actual_length != byte_length:
        raise PaspError("PASP_CHECKSUM_MISMATCH", f"checksum or length mismatch: {path}", context=str(path))
