# PASP 1.0 Adapter Event Protocol

Adapters may communicate with a host as UTF-8 NDJSON: one JSON object per line, no BOM preferred, no binary data inline. This event stream is separate from stored resource NDJSON. If an implementation does not yet run external-process adapters, this document still defines the interoperable event contract.

## Events

Required event fields are `type` plus the fields listed below.

| Event | Required fields | Ordering |
|---|---|---|
| `export_begin` | `scope` | first event |
| `resource_begin` | `resource` | after begin; one active resource |
| `schema` | `resource`, `schema` or `schemaRef` | after resource begin, at most once |
| `record` | `resource`, `value` object | after schema, zero or more |
| `checkpoint` | `resource`, `value` JSON | after resource begin; optional and repeatable |
| `relationship` | `relationship` | after endpoints are declared; optional |
| `asset` | `asset` descriptor | after export begin; optional and repeatable |
| `resource_end` | `resource` | closes the active resource |
| `export_end` | none | last event |

`resource_begin` and `resource_end` must be balanced. `record` and `checkpoint` must refer to the active resource. `schema` must precede the first record. `export_end` is valid only after all resources close. Unknown event types are invalid in PASP 1.0 unless an implementation explicitly negotiates an extension.

Adapters write events to stdout. Diagnostics and human-readable logs go to stderr. The stream is UTF-8, line-delimited JSON, and a malformed line is a protocol error. Asset bytes are transferred through an implementation-defined side channel or package-relative object path; they are not embedded as arbitrary binary in an event.
