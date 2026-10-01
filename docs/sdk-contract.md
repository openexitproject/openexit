# OpenExit SDK Contract

Language SDKs implement PASP 1.0 from `protocol/pasp/v1/`. The protocol files, schemas, package semantics, and `protocol/pasp/v1/conformance/suite.json` are authoritative; language-specific types are not.

Each SDK v0.1 should report protocol version 1.0, parse and validate manifests, inspect packages, expose native models, return stable PASP error codes, and run the shared conformance suite. Idiomatic API names are allowed; semantics must remain equivalent.

Node/npm `openexit` is published. Python/PyPI `openexit` 0.1.0 is implemented in `sdk/python/` and ready for publication. RubyGems and crates.io may later use `openexit`, NuGet `OpenExit`, and Go a module such as `github.com/<org>/openexit-go`.
