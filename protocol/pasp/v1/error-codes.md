# PASP 1.0 Error Codes

Protocol errors use these stable machine-readable names. SDK exceptions may wrap them, but conformance runners compare the code.

| Code | Meaning |
|---|---|
| `PASP_UNSUPPORTED_VERSION` | `paspVersion` major/minor is not supported |
| `PASP_INVALID_MANIFEST` | Manifest shape or required value is invalid |
| `PASP_MISSING_SCHEMA` | A required schema reference cannot be found |
| `PASP_INVALID_RESOURCE` | Resource descriptor or resource path is invalid |
| `PASP_DUPLICATE_RESOURCE` | Resource names are not unique |
| `PASP_INVALID_RECORD` | A stored resource record is not a JSON object or violates the resource contract |
| `PASP_CHECKSUM_MISMATCH` | A declared checksum does not match bytes |
| `PASP_MISSING_ASSET` | An asset descriptor points to missing bytes |
| `PASP_INVALID_RELATIONSHIP` | Relationship endpoints or cardinality are invalid |
| `PASP_PATH_TRAVERSAL` | A package-relative path escapes the package root or is absolute |
| `PASP_MALFORMED_PACKAGE` | Required package files or directory structure are missing |
