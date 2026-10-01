import hashlib
from pathlib import Path

import pytest

from openexit import PaspError
from openexit.integrity import hash_file, verify_file


def test_hashing_streams_large_file(tmp_path: Path):
    data = b"abc123" * (1024 * 1024)
    path = tmp_path / "large.bin"
    path.write_bytes(data)
    digest, count = hash_file(path)
    assert count == len(data)
    assert digest == hashlib.sha256(data).hexdigest()
    verify_file(path, digest, count)
    path.write_bytes(data + b"x")
    with pytest.raises(PaspError) as raised:
        verify_file(path, digest, count)
    assert raised.value.code == "PASP_CHECKSUM_MISMATCH"
