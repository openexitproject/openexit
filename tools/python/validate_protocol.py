"""Independent JSON Schema proof for PASP 1.0."""
from pathlib import Path
import json
import sys
from jsonschema import Draft202012Validator, RefResolver

ROOT = Path(__file__).resolve().parents[2] / "protocol" / "pasp" / "v1"
SCHEMAS = ROOT / "schemas"
CONFORMANCE = ROOT / "conformance"

def load(name):
    return json.loads((SCHEMAS / name).read_text(encoding="utf-8"))

def validate(name, document):
    schema = load(name)
    store = {(SCHEMAS / p.name).as_uri(): load(p.name) for p in SCHEMAS.glob("*.json")}
    resolver = RefResolver((SCHEMAS / name).as_uri(), schema, store=store)
    errors = sorted(Draft202012Validator(schema, resolver=resolver).iter_errors(document), key=lambda e: list(e.path))
    if errors: raise AssertionError(f"{name}: {errors[0].message}")

def main():
    suite = json.loads((CONFORMANCE / "suite.json").read_text(encoding="utf-8"))
    for case in suite["cases"]:
        if not case["expected"]["valid"]: continue
        package = CONFORMANCE / case["path"]
        manifest = json.loads((package / "manifest.json").read_text(encoding="utf-8"))
        validate("manifest.schema.json", manifest)
        for entry in manifest["resources"]:
            validate("resource.schema.json", json.loads((package / entry["descriptor"]).read_text(encoding="utf-8")))
        if manifest.get("relationships"):
            for relationship in json.loads((package / manifest["relationships"]).read_text(encoding="utf-8")): validate("relationship.schema.json", relationship)
        if manifest["assets"]["count"]:
            for line in (package / "assets/index.ndjson").read_text(encoding="utf-8").splitlines(): validate("asset.schema.json", json.loads(line))
    print("PASP schema validation: PASS")

if __name__ == "__main__":
    try: main()
    except Exception as error:
        print(f"PASP schema validation: FAIL: {error}", file=sys.stderr)
        raise
