# PASP 1.0 Package Format

The canonical directory representation is:

```text
example.pasp/
├── manifest.json
├── relationships.json                 # optional; required when relationships exist
├── checksums.sha256                  # optional package-level index
├── schemas/
│   └── users.schema.json
├── resources/
│   └── users/
│       ├── resource.json
│       ├── 00000001.ndjson
│       └── 00000002.ndjson
└── assets/
    ├── index.ndjson
    └── objects/
        └── <asset bytes>
```

`manifest.json` is validated by `schemas/manifest.schema.json`. Every resource listed by the manifest has one descriptor at `resources/<name>/resource.json`; its chunks are direct-record NDJSON files at the paths listed in that descriptor. A schema reference is either a package-relative `schemas/*.schema.json` path or an inline JSON Schema.

Chunk descriptors start at sequence 1 and increase contiguously by exactly 1 with no duplicates. The sequence and filename must match exactly: sequence 1 uses resources/<name>/00000001.ndjson, sequence 2 uses resources/<name>/00000002.ndjson, and each later sequence uses the corresponding eight-digit zero-padded filename. JSON Schema enforces the integer minimum; bundle validation enforces ordering, contiguity, and filename correspondence.

Package-relative paths must use `/`, must not begin with `/`, a drive prefix, or `~`, and must not contain `..` path segments. Resource names are identifiers and cannot create nested paths.

`relationships.json` is an array of relationship descriptors. `assets/index.ndjson` is one asset descriptor per line; the corresponding bytes live at the descriptor's package-relative path. A package may omit both files when it has no relationships or assets.

`checksums.sha256` is an optional newline-delimited index of lowercase SHA-256 plus package-relative path. Resource chunk and asset descriptor hashes remain authoritative even when the index is omitted.

Implementations may expose another physical representation, but it must preserve these logical semantics and produce equivalent conformance results.



