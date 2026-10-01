use crate::{PASP_VERSION, PaspError, Result, models::Manifest, paths, schema};
use serde_json::Value;
use std::{io::Read, path::Path};
pub fn parse_manifest_str(input: &str) -> Result<Value> {
    let value: Value = serde_json::from_str(input).map_err(|e| {
        PaspError::new("PASP_INVALID_MANIFEST", "cannot parse manifest JSON").with_source(e)
    })?;
    if value.is_object() {
        Ok(value)
    } else {
        Err(PaspError::new(
            "PASP_INVALID_MANIFEST",
            "manifest must be a JSON object",
        ))
    }
}
pub fn parse_manifest_reader<R: Read>(mut reader: R) -> Result<Value> {
    let mut input = String::new();
    reader.read_to_string(&mut input).map_err(|e| {
        PaspError::new("PASP_INVALID_MANIFEST", "cannot read manifest JSON").with_source(e)
    })?;
    parse_manifest_str(&input)
}
pub fn parse_manifest_file<P: AsRef<Path>>(path: P) -> Result<Value> {
    parse_manifest_reader(std::fs::File::open(path).map_err(|e| {
        PaspError::new("PASP_INVALID_MANIFEST", "cannot open manifest JSON").with_source(e)
    })?)
}
pub fn validate_manifest(value: &Value) -> Result<Manifest> {
    let object = value
        .as_object()
        .ok_or_else(|| PaspError::new("PASP_INVALID_MANIFEST", "manifest must be an object"))?;
    if let Some(version) = object.get("paspVersion").and_then(Value::as_str)
        && version != PASP_VERSION
    {
        return Err(PaspError::new(
            "PASP_UNSUPPORTED_VERSION",
            format!("unsupported PASP version: {version}"),
        ));
    }
    if let Some(resources) = object.get("resources").and_then(Value::as_array) {
        let mut names = std::collections::HashSet::new();
        for entry in resources {
            let name = entry
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| PaspError::new("PASP_INVALID_RESOURCE", "invalid resource name"))?;
            if name.len() > 128
                || name.is_empty()
                || !name.as_bytes()[0].is_ascii_alphanumeric()
                || !name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'_' || b == b'-')
            {
                return Err(PaspError::new(
                    "PASP_INVALID_RESOURCE",
                    "invalid resource name",
                ));
            }
            if !names.insert(name) {
                return Err(PaspError::new(
                    "PASP_DUPLICATE_RESOURCE",
                    format!("duplicate resource: {name}"),
                ));
            }
            let descriptor = entry
                .get("descriptor")
                .and_then(Value::as_str)
                .ok_or_else(|| PaspError::new("PASP_INVALID_MANIFEST", "invalid descriptor"))?;
            paths::validate_package_path(descriptor)?;
            if descriptor != format!("resources/{name}/resource.json") {
                return Err(PaspError::new(
                    "PASP_INVALID_MANIFEST",
                    "invalid descriptor",
                ));
            }
        }
    }
    schema::validate_document("manifest", value, "PASP_INVALID_MANIFEST")?;
    Ok(Manifest { raw: value.clone() })
}
