use std::path::PathBuf;
#[test]
fn canonical_schema_copies_match() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for entry in std::fs::read_dir(root.join("..\\..\\protocol\\pasp\\v1\\schemas")).unwrap() {
        let entry = entry.unwrap();
        let name = entry.file_name();
        assert_eq!(
            std::fs::read(entry.path()).unwrap(),
            std::fs::read(root.join("schemas").join(&name)).unwrap(),
            "schema drift: {}",
            name.to_string_lossy()
        );
    }
}
