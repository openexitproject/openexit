# PASP v1 Protocol Audit

The canonical PASP protocol definition lives under `protocol/pasp/v1/`. Language SDKs implement this protocol. Language-specific types are not normative.

## CURRENT BEHAVIOR

The existing npm package is `openexit@0.1.0`; its package version is independent from the protocol version.

- `src/transfer.js` writes a directory containing `manifest.json` and numbered `chunk-XXXXXXXX.ndjson` files.
- The current manifest uses `format: "openexit.bundle"`, `{major: 1, minor: 0}` under `protocol`, a UUID `bundleId`, a source descriptor, `chunkSize`, ordered chunk descriptors, `recordCount`, an opaque `nextCursor`, and `complete`.
- A source adapter exposes `describe()` and paged `readPage({cursor, limit})`. It returns canonical records with `type`, `id`, and `state`; optional `links` and `meta` are accepted.
- A target adapter exposes `describe()` and `writeBatch(records, context)`. Imports checkpoint after each completed chunk in a target-specific `.import-<hash>.json` file.
- Stored chunk lines currently contain `{seq, record}` envelopes. The implementation validates sequence numbers, record counts, and SHA-256 digests before applying a chunk.
- Writes use temporary files followed by rename. Export resumes from the committed cursor. Import requires an idempotent target because the last chunk can be replayed.
- `src/schema.js` validates source descriptions, canonical records, and the existing manifest shape. There are no JSON Schemas, asset descriptors, relationship files, package-level checksums, or external-process event adapters yet.
- `src/cli.js` supports `export`, `import`, and `inspect`. `inspect` validates only the current manifest; it does not perform a full package/resource/asset inspection.

## INCONSISTENCIES / AMBIGUITIES

| Item | Finding | Classification before freeze | Compatibility impact |
|---|---|---|---|
| Protocol naming | Existing docs call the wire contract “OpenExit Protocol version 1.0”; this task freezes the public protocol name as PASP and the protocol version as `1.0`. | Clarification | Existing bundles retain `openexit.bundle` and `protocol: {major: 1, minor: 0}`. |
| Manifest identity | Existing fields are `bundleId` and `source`; the requested PASP manifest names are `packageId`, `exportId`, `scope`, `producer`, `consistency`, `resources`, `assets`, and `integrity`. | Additive/clarification | Existing Node bundles remain readable by the legacy validator; PASP packages use the frozen manifest schema. |
| Stored record shape | Existing chunks store `{seq, record}` envelopes, while PASP resource NDJSON stores records directly. | Clarification | Existing transfer bundles remain a legacy OpenExit transfer representation. PASP package resources are direct record lines. |
| Resources | Existing implementation has implicit one-stream chunks and no resource descriptor. | Additive | No existing resource bundles are broken because none were implemented. |
| Assets and relationships | No current runtime representation exists. | Additive | No existing behavior changes. |
| Scope and consistency | No current scope model or consistency level exists. | Additive | Adapters may continue using their source descriptor; PASP manifests require explicit scope and consistency. |
| Error codes | Existing errors use names such as `CHECKSUM_MISMATCH` and `INCOMPATIBLE_VERSION`. | Additive mapping | PASP validation exposes stable `PASP_*` codes; Node errors can retain existing messages while mapping protocol failures. |
| Paths | Existing chunk filenames are generated internally and are not user-controlled. | Security clarification | PASP package paths are constrained and traversal is rejected. |

No breaking runtime change is required to establish the protocol documents and shared fixtures. The Node legacy directory transfer remains available while PASP package semantics are frozen independently.

## PROPOSED FROZEN PASP v1 CONTRACT

PASP 1.0 is a language-neutral logical application-state package contract. It is not a ZIP format and does not require a single archive file. The canonical directory representation, JSON Schemas, adapter event stream, error codes, and conformance fixtures are under `protocol/pasp/v1/`.

- A package has a manifest, resource descriptors/chunks, optional schemas, optional relationships, optional assets, and integrity metadata.
- A scope identifies the logical exported state with `type`, `id`, and optional `metadata`.
- Resources are named logical collections of JSON object records. Resource names are identifiers, not arbitrary filesystem paths.
- Assets are opaque content addressed by `sha256` and described without requiring the whole asset to be held in memory.
- Relationships are explicit and identify endpoints by resource and JSON Pointer.
- Chunks are ordered, independently checksummed, and bounded. Checkpoint values are opaque JSON values used for resume/progress and are distinct from finalized portable package state.
- Consistency is `snapshot`, `bounded`, or `best_effort` and is recorded by the producer.
- UTF-8 JSON and NDJSON follow the rules in `specification.md`; timestamps are RFC 3339 and hashes are lowercase SHA-256 hex.
- Protocol compatibility is `PASP 1.0`; SDK/package versions such as `openexit@0.1.0` are separate.

The shared conformance suite is authoritative for observable validity and stable error-code behavior. A Python implementation that uses only `protocol/pasp/v1/` and the conformance fixtures must be able to implement the package validator without reading Node source.

## CHUNK SEQUENCE ALIGNMENT

### Current Node behavior

The canonical PASP validator requires descriptor position i to have sequence i + 1, and existing PASP fixtures use one-based contiguous sequences. The separate legacy transfer format emits zero-based chunk-00000000.ndjson indexes and is outside PASP package validation.

### Current Python behavior

Python previously required strictly increasing sequences and matching eight-digit resource filenames, but its comparison began at -1 and the packaged schema allowed sequence zero.

### Current PASP wording

PASP described chunks as ordered but did not explicitly define the starting sequence, contiguity, or filename correspondence.

### Observed ambiguity

Existing canonical fixtures and Node PASP validation used sequences 1, 2, ... while the schema and Python boundary condition left sequence zero ambiguous.

### Chosen rule

PASP 1.0 sequences are integers beginning at 1, contiguous by exactly 1, unique, and matched to eight-digit filenames (00000001.ndjson, 00000002.ndjson, ...). Schema validation enforces sequence >= 1; bundle validation enforces contiguity and filename correspondence.

### Compatibility impact

This is a clarification of existing PASP behavior. Legacy chunk-XXXXXXXX.ndjson transfer bundles remain unchanged and zero-based.

