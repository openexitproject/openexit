# OpenExit

> Portable state for any application.

This package implements PASP — the Portable Application State Protocol — for Python. OpenExit is the implementation and ecosystem; PASP 1.0 is the language-neutral protocol. SDK version 0.1.0 is separate from protocol version 1.0.

## Install

```bash
pip install openexit
```

## Inspect and verify

```python
from openexit import inspect_bundle, verify_bundle

bundle = inspect_bundle("./acme.pasp")
print(bundle.pasp_version)
print(bundle.scope)
print(bundle.resources)

verified = verify_bundle("./acme.pasp")
print(verified.verified)
```

`inspect_bundle` reads the manifest, descriptors, relationship metadata, and asset index. `verify_bundle` additionally streams all resource records and asset bytes, checks record schemas and identities, counts, and SHA-256 hashes. Both accept directory bundles.

## Manifest validation

```python
from pathlib import Path
from openexit import parse_manifest, validate_manifest

manifest = parse_manifest(Path("./acme.pasp/manifest.json"))
validate_manifest(manifest)  # returns None or raises PaspError
```

`parse_manifest` also accepts a mapping, JSON text, or UTF-8 JSON bytes. A string is treated as JSON text; pass a `Path` to read a file. Parsing does not imply validation. Models retain the raw manifest fields. Protocol errors expose a stable `code`:

```python
from openexit import PaspError

try:
    verify_bundle("./acme.pasp")
except PaspError as exc:
    print(exc.code)
```

## Protocol source

The canonical PASP definition is in the repository at `protocol/pasp/v1/`; the shared suite is `protocol/pasp/v1/conformance/suite.json`. Installed wheels contain exact copies of the canonical JSON Schemas and do not require the repository at runtime.

## Current limits

This SDK reads PASP 1.0 directory bundles. It does not export or import application state, run adapters, execute external processes, unpack archives, or check full referential integrity. Inspection and verification use bounded file reads; one NDJSON record or metadata file is parsed at a time. Symlinks that leave the bundle root are rejected.
