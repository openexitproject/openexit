# Python 0.1 implementation notes

## Canonical PASP assumptions

`protocol/pasp/v1/` and its shared conformance suite define PASP 1.0. Directory bundles use `openexit.bundle`, `manifest.json`, resource descriptors and direct-record NDJSON chunks, optional relationship and asset indexes, and SHA-256 integrity. Package paths use protocol / separators. SDK version 0.1.0 is independent of PASP version 1.0.

## Python API mapping

`parse_manifest` parses JSON into a `Manifest` dataclass without protocol validation. It accepts a mapping, JSON text, UTF-8 bytes, or an explicit PathLike file. `validate_manifest` returns None or raises `PaspError`. `inspect_bundle` returns a metadata summary; `verify_bundle` performs full streaming integrity and record verification and returns that summary. Dataclasses are ergonomic views; packaged canonical JSON Schemas are normative.

## Error mapping

All protocol failures raise `PaspError` with a stable `PASP_*` code. Missing manifest maps to `PASP_MALFORMED_PACKAGE`; schema, resource, record, asset, relationship, path, version, and checksum failures map to their corresponding frozen codes.

## Bundle inspection strategy

Read small JSON metadata files directly. Stream NDJSON chunks and asset index line by line during verification; hash chunk and asset bytes in bounded blocks. Inspection reads descriptors and summary metadata without loading record or asset contents. Reject unsafe package paths and symlinks escaping the bundle root.

## Schema-loading strategy

Copy canonical `protocol/pasp/v1/schemas/*.json` into `src/openexit/schemas/` as package data. Load with `importlib.resources`; resolve schema references from those packaged copies. Tests compare copies byte-for-byte with canonical files. An installed wheel never traverses back into the repository.

## Chunk sequence interpretation

The frozen chunk schema permits nonnegative sequence values and the specification requires deterministic order, without requiring a starting value or contiguous values. Python accepts strictly increasing sequences whose eight-digit filenames match their sequence. The shared fixtures use one-based contiguous sequences; this interpretation may be worth an explicit future conformance case.
