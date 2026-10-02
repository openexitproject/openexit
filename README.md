# OpenExit

OpenExit is a developer toolkit for moving application state between software systems. A vendor's source adapter maps proprietary data into canonical records. OpenExit writes a portable bundle; a destination adapter maps those records into another application's state.

The repository root package is the OpenExit Node SDK. Other language SDKs are maintained under `sdk/`.

This package implements **PASP (Portable Application State Protocol) 1.0**. The stable protocol name is PASP; it is independent of the stable `openexit.bundle` wire-format identifier.

## Protocol source of truth

The canonical PASP specification is located at `protocol/pasp/v1/`. Language SDKs must conform to the JSON Schemas, package semantics, and conformance fixtures in that directory. No language SDK is authoritative over the protocol. OpenExit Node SDK version `0.1.0` implements **PASP (Portable Application State Protocol) 1.0**; these versions are separate.

## Install and run

Requires Node.js 20 or newer. There are no runtime dependencies.

~~~sh
npm install -g openexit
openexit --version
openexit --help
~~~

From this repository, the included adapter demonstrates export and import:

~~~sh
openexit export --adapter ./examples/adapter.js --dir ./bundle --chunk-size 2
openexit inspect --dir ./bundle
openexit import --adapter ./examples/adapter.js --dir ./bundle --batch-size 1
~~~

During development, `node src/cli.js` works in place of `openexit`. The example reads `examples/customers.ndjson` and writes account-shaped records to `examples/imported/`. Set `OPENEXIT_INPUT` and `OPENEXIT_OUTPUT` to use other paths. After an interrupted export, repeat the export command with `--resume`. Import resumes automatically.

## Python SDK

The source for the Python `openexit` package is at [sdk/python/](./sdk/python/README.md). It parses and validates PASP manifests, inspects directory bundles, verifies checksums and records, and runs the shared PASP conformance suite. The Python package is prepared for PyPI but has not been published from this repository.

## Go SDK

The Go `openexit` package is at [sdk/go/](./sdk/go/README.md). It parses, validates, inspects, and verifies PASP 1.0 directory bundles and embeds the canonical PASP schemas.

## Adapter contract

An adapter module exports `source`, `target`, or both. A source provides:

~~~js
export const source = {
  describe() {
    return { name: 'my-app', schemaVersion: '1', snapshot: 'stable-snapshot-id' };
  },
  async readPage({ cursor, limit }) {
    // Return at most limit canonical records.
    return { records: [], nextCursor: cursor, done: true };
  }
};
~~~

`describe()` identifies the source schema and snapshot. A cursor identifies the first unread record. The source must keep record order and contents stable during export and resume. OpenExit commits the next cursor only after writing the corresponding chunk and manifest.

A target provides:

~~~js
export const target = {
  describe() { return { name: 'my-destination', instance: 'tenant-123' }; },
  async writeBatch(records, { bundleId, chunkIndex, batchIndex }) {
    // Apply records to the destination.
  }
};
~~~

`describe()` identifies the exact destination for its checkpoint. `writeBatch` must be **idempotent**. A stopped import can replay its last chunk. Upsert by `(type, id)`, or deduplicate with the supplied bundle, chunk, and batch identity. The included example uses deterministic output filenames.

## Canonical records

Each record requires `type`, `id`, and `state`:

~~~json
{"type":"customer","id":"c-1","state":{"name":"Ada"},"links":{"team":["t-1"]},"meta":{"sourceVersion":"1"}}
~~~

`state`, optional `links`, and optional `meta` contain JSON values. Adapters own mappings between their proprietary schemas and this interface. The JavaScript API exports `exportBundle`, `importBundle`, `inspectBundle`, and validators. Export and import accept an async `transform(record, context)` callback; returning `null` drops a record.

## Bundle format

A bundle directory contains `manifest.json` and numbered NDJSON chunk files. The manifest records the OpenExit Protocol version, source snapshot, chunk order, record counts, SHA-256 digests, resume cursor, and completion state. Import checks each chunk's digest before applying it, validates records as it reads them, and checkpoints after each chunk. See [PROTOCOL.md](./PROTOCOL.md) for the wire format.

## Current limitations

- Export holds one page in memory and import holds one batch. Very large individual records or chunks can still use substantial memory.
- Bundles use local files and NDJSON. Remote storage, compression, encryption, and other bundle encodings are not implemented.
- Source adapters must provide stable snapshots. Target adapters must make writes idempotent. There is no distributed transaction across applications.
- One process should write a bundle or target checkpoint at a time; multi-process locking is not implemented.
- The Node toolkit provides export/import. The Python 0.1 SDK inspects and verifies PASP 1.0 directory bundles; it does not export or import.
- OpenExit Protocol version 1.0 validates the canonical envelope and major wire version; it does not provide a domain-schema migration registry.

Licensed under MIT. The example adapter and sample input are included in the npm package.
