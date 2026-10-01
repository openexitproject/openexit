# OpenExit Go SDK implementation notes

- Toolchain: Go 1.27.0, windows/amd64.
- Final repository: `github.com/openexitproject/openexit`.
- Final Go module: `github.com/openexitproject/openexit/sdk/go`.
- Package: `openexit`; SDK version: `0.1.0`; PASP version: `1.0`.
- Canonical schemas: 9 files copied byte-for-byte from `protocol/pasp/v1/schemas/` and embedded with `embed.FS`.
- Canonical schema IDs are retained in the embedded files. Runtime loading is limited to embedded canonical schemas and package-local resource schema paths.
- JSON Schema validation uses `github.com/santhosh-tekuri/jsonschema/v6` v6.0.3 with `Draft2020`, actual canonical `$id` registration, and a deny-all loader for unregistered URLs.
- Runtime schema resolution never performs HTTP, HTTPS, or arbitrary `file://` loads.
- Resource chunks and asset indexes use `bufio.Reader`; assets use bounded `io.CopyBuffer` hashing. Memory scales with the largest line and fixed buffers, not total bundle size.
- Raw package paths are validated with protocol-independent POSIX rules before access. Go 1.27 `os.OpenRoot`/`os.Root` confines reads and rejects links escaping the bundle root.
- Protocol errors use the canonical PASP error codes from `protocol/pasp/v1/error-codes.md`.
- The future nested-module release tag is `sdk/go/v0.1.0`; no tag is created here.
