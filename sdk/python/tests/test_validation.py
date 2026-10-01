from pathlib import Path

from jsonschema import Draft202012Validator

from openexit import load_schema

ROOT = Path(__file__).resolve().parents[3]
CANONICAL = ROOT / "protocol/pasp/v1/schemas"


def test_packaged_schemas_are_exact_canonical_copies():
    from importlib import resources
    for path in CANONICAL.glob("*.json"):
        installed = resources.files("openexit.schemas").joinpath(path.name)
        assert installed.read_bytes() == path.read_bytes()
        Draft202012Validator.check_schema(load_schema(path.name.removesuffix(".schema.json")))
