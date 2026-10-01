# OpenExit

> Portable state for any application.

This crate implements PASP — the Portable Application State Protocol — for Rust.

Crate version: 0.1.0  
PASP protocol: 1.0

```toml
[dependencies]
openexit = "0.1"
```

Inspect a bundle:

```rust
use openexit::inspect_bundle;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let info = inspect_bundle("./acme.pasp")?;
    println!("{}", info.pasp_version);
    Ok(())
}
```

Parse and validate a manifest:

```rust
use openexit::{parse_manifest_str, validate_manifest};

let value = parse_manifest_str(r#"{"format":"openexit.bundle"}"#)?;
let _manifest = validate_manifest(&value)?;
# Ok::<(), openexit::PaspError>(())
```

Verify a directory bundle:

```rust
use openexit::verify_bundle;
let result = verify_bundle("./acme.pasp")?;
assert!(result.verified);
# Ok::<(), openexit::PaspError>(())
```

OpenExit is an implementation and ecosystem around the open PASP protocol. This v0.1 crate reads, inspects, and verifies directory bundles; it does not write or export bundles.
