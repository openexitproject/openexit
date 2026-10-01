use openexit::{PaspError, verify_bundle};
use std::path::PathBuf;
#[test]
fn shared_conformance_suite() {
    let root =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..\\..\\protocol\\pasp\\v1\\conformance");
    let suite: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(root.join("suite.json")).unwrap()).unwrap();
    let cases = suite["cases"].as_array().unwrap();
    for case in cases {
        let result = verify_bundle(root.join(case["path"].as_str().unwrap()));
        if case["expected"]["valid"].as_bool().unwrap() {
            assert!(result.is_ok(), "{}: {result:?}", case["id"]);
        } else {
            let error: PaspError = result.unwrap_err();
            assert_eq!(
                error.code(),
                case["expected"]["errorCode"].as_str().unwrap(),
                "{}",
                case["id"]
            );
        }
    }
    assert_eq!(cases.len(), 27);
}
