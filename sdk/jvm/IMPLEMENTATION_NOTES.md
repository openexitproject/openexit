# Implementation notes

- Audited remote: `https://github.com/openexitproject/openexit.git`; initial working tree was clean.
- Toolchain observed: `java -version` selected Microsoft OpenJDK 25.0.4.1; `javac -version` selected 25.0.4.1 but printed `Access is denied`; Maven 3.9.16 ran on Microsoft OpenJDK 21.0.12.1. Compilation uses `--release 17`.
- JSON Schema validator: `com.networknt:json-schema-validator:1.5.9`, with Jackson Databind 2.18.2. The 1.x API matches Jackson 2 and supports Draft 2020-12; the newer 2.x API has a substantially changed validation interface and 3.x uses Jackson 3. Validator factory explicitly selects V202012.
- Root license is MIT, copyright OpenExit contributors, 2026.
- Developer contact and Central namespace verification were not present in repository metadata; release metadata remains subject to confirmation.

The implementation supports directory bundles only. Inspection currently summarizes manifest metadata and is intentionally lighter than verification.

Filesystem access rejects protocol traversal and verifies both normalized lexical containment and resolved `toRealPath()` containment before opening existing paths. This rejects observed file and directory symlink escapes and is expected to reject junctions whose resolved target is outside the bundle. The check and later open are separate operations; the implementation does not claim race-free TOCTOU protection. Windows junction creation is covered by a best-effort temporary test.
