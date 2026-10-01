# PASP Versioning

PASP protocol version `1.0` and an SDK/package version are separate. For example, `openexit@0.1.0` implements PASP 1.0.

Readers must reject an unsupported major protocol version with `PASP_UNSUPPORTED_VERSION`. Minor revisions may add optional fields and events that a reader can ignore when it has not negotiated them. A change to required fields, path safety, checksum meaning, record representation, or event ordering requires a new major version.

The stable machine identifier for the canonical package is `openexit.bundle`. Renaming the human-facing protocol does not change that identifier or the `paspVersion` field.
