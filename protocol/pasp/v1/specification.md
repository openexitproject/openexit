# PASP 1.0 Specification

PASP (Portable Application State Protocol) is a language-neutral contract for moving logical application state between software systems. OpenExit is one implementation; Node, Python, Ruby, Rust, .NET, and Go implementations must consume this protocol rather than define competing semantics.

The canonical PASP protocol definition lives under `protocol/pasp/v1/`. Language SDKs implement this protocol. Language-specific types are not normative.

PASP defines logical state, not one transport archive. A package may be represented as a directory, tarball, object-store prefix, stream, or a future columnar representation. The canonical directory form is specified in `package-format.md`.

## Data model

### Scope

A scope identifies the logical state being exported. It has a string `type`, string `id`, and optional JSON `metadata`. PASP does not prescribe a tenant model.

### Resource and record

A resource is a named logical collection of JSON object records. A resource descriptor includes its name, schema reference or inline schema, identity definition, final record count, and ordered chunk descriptors. A record is stored as the JSON object itself in resource NDJSON; PASP does not wrap every stored row in protocol metadata.

Resource names match `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` and are never interpreted as arbitrary paths. Record identity may be one field or a list of fields, allowing composite identity.

### Assets

Assets are binary or opaque content. An asset descriptor includes `id`, package-relative `path`, lowercase SHA-256, and byte length. Asset bytes are streamed from the object path; implementations must not require all assets in memory.

### Relationships

Relationships are explicit. Each endpoint names a resource and a JSON Pointer into a record. Cardinality is one of `one-to-one`, `one-to-many`, `many-to-one`, `many-to-many`, or `reference`. Implementations must not infer relationships from field names.

### Chunks and checkpoints

Resource chunks are ordered and independently checksummed. A chunk contains `sequence`, `path`, `recordCount`, `uncompressedBytes`, and `sha256`. Chunk sequence numbers are integers beginning at 1, increase contiguously by exactly 1, and contain no duplicates. Sequence N corresponds exactly to the zero-padded filename `0000000N.ndjson` (for example, 1 is `00000001.ndjson` and 2 is `00000002.ndjson`). Bundle validation rejects gaps, duplicates, out-of-order chunks, and filename/sequence mismatches. Checkpoint values are opaque JSON values for adapter resume/progress; core implementations do not interpret them. Internal resume state is distinct from finalized package state.

## Consistency

- `snapshot`: all resources correspond to one consistent snapshot.
- `bounded`: resources may have different capture points, but capture boundaries, timestamps, or source tokens are recorded by the producer.
- `best_effort`: no global consistency guarantee is made.

## JSON and text rules

All JSON and NDJSON is UTF-8, with no BOM preferred. JSON follows RFC 8259 semantics. NDJSON contains one JSON value per line and no binary values inline unless explicitly encoded by an extension. Timestamps are RFC 3339. SHA-256 values are lowercase hexadecimal.

## Version identity

`PASP 1.0` is the protocol version. It is separate from an SDK version such as `openexit@0.1.0`. The machine wire identifier for the canonical package is `openexit.bundle`; it is retained for compatibility and does not rename the human-facing protocol.

