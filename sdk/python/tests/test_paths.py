from pathlib import Path

import pytest

from openexit import PaspError
from openexit.paths import safe_package_path


def test_valid_nested_path(tmp_path: Path):
    assert safe_package_path(tmp_path, "resources/users/00000001.ndjson") == tmp_path / "resources/users/00000001.ndjson"


@pytest.mark.parametrize("value", ["../foo", "../../foo", "/foo", "C:\\foo", "\\\\server\\share", "resources/..\\foo", "a/../b", "~user/x", "a//b", "a\x00b"])
def test_unsafe_paths(tmp_path: Path, value: str):
    with pytest.raises(PaspError) as raised:
        safe_package_path(tmp_path, value)
    assert raised.value.code == "PASP_PATH_TRAVERSAL"


def test_symlink_escape(tmp_path: Path):
    outside = tmp_path.parent / "outside-pasp-target"
    outside.write_text("outside", encoding="utf-8")
    link = tmp_path / "link"
    try:
        link.symlink_to(outside)
    except OSError:
        pytest.skip("symlink creation unavailable")
    with pytest.raises(PaspError):
        safe_package_path(tmp_path, "link")
