# Rust PASP implementation notes

The crate implements the canonical PASP 1.0 directory representation from `protocol/pasp/v1/`.

- Concepts exposed: scope, producer, consistency, integrity, resources, chunks, assets, relationships, manifests, and inspection results.
- Canonical schemas are copied byte-for-byte and embedded with `include_str!`; Draft 2020-12 validation uses an in-memory registry of the canonical `$id` values.
- Manifest validation is separate from JSON parsing. Resources use descriptor-declared schemas, direct-record NDJSON, one-based contiguous chunks, and declared record counts.
- Inspection reads metadata and streams asset indexes without hashing record or asset bytes; verification streams records, asset indexes, assets, and checksum files, with incremental SHA-256.
- Protocol paths are validated as POSIX protocol strings before native path conversion, including foreign Windows absolute-path forms, traversal, NUL, and symlink containment checks.
- Unsupported PASP versions return `PASP_UNSUPPORTED_VERSION`; protocol failures use the canonical error codes in `error-codes.md`.
- Unknown optional fields are accepted or rejected by the canonical schemas; Rust models preserve the complete manifest in `Manifest::raw`.
- No remote schema resolution is enabled. Customer `$ref` values not resolved from the supplied schema are controlled validation failures.
- Node/Python agreement was checked against the shared suite; no protocol discrepancy was found.
