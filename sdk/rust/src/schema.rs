use crate::{PaspError, Result};
use jsonschema::{Draft, Registry, Resource};
use serde_json::Value;
const NAMES: &[&str] = &[
    "manifest",
    "scope",
    "resource",
    "resource-chunk",
    "asset",
    "relationship",
    "checkpoint",
    "event",
    "inspection-result",
];
pub fn load_schema(name: &str) -> Result<Value> {
    let text = match name {
        "manifest" => include_str!("../schemas/manifest.schema.json"),
        "scope" => include_str!("../schemas/scope.schema.json"),
        "resource" => include_str!("../schemas/resource.schema.json"),
        "resource-chunk" => include_str!("../schemas/resource-chunk.schema.json"),
        "asset" => include_str!("../schemas/asset.schema.json"),
        "relationship" => include_str!("../schemas/relationship.schema.json"),
        "checkpoint" => include_str!("../schemas/checkpoint.schema.json"),
        "event" => include_str!("../schemas/event.schema.json"),
        "inspection-result" => include_str!("../schemas/inspection-result.schema.json"),
        _ => {
            return Err(PaspError::new(
                "PASP_MISSING_SCHEMA",
                format!("unknown schema: {name}"),
            ));
        }
    };
    serde_json::from_str(text).map_err(|e| {
        PaspError::new("PASP_MISSING_SCHEMA", "invalid embedded schema").with_source(e)
    })
}
pub(crate) fn validate_document(name: &str, value: &Value, code: &str) -> Result<()> {
    let mut builder = Registry::new();
    for item in NAMES {
        let schema = load_schema(item)?;
        let id = schema["$id"]
            .as_str()
            .ok_or_else(|| PaspError::new("PASP_MISSING_SCHEMA", "schema has no id"))?
            .to_owned();
        builder = builder
            .add(id, Resource::from_contents(schema))
            .map_err(|e| {
                PaspError::new("PASP_MISSING_SCHEMA", "cannot register schema").with_source(e)
            })?;
    }
    let registry = builder.prepare().map_err(|e| {
        PaspError::new("PASP_MISSING_SCHEMA", "cannot prepare schema registry").with_source(e)
    })?;
    let schema = load_schema(name)?;
    let validator = jsonschema::options()
        .with_draft(Draft::Draft202012)
        .with_registry(&registry)
        .offline()
        .build(&schema)
        .map_err(|e| PaspError::new(code, "invalid schema").with_source(e))?;
    if validator.is_valid(value) {
        Ok(())
    } else {
        Err(PaspError::new(code, format!("invalid {name}")))
    }
}
pub(crate) fn validate_customer(schema: &Value, value: &Value, code: &str) -> Result<()> {
    let validator = jsonschema::options()
        .with_draft(Draft::Draft202012)
        .offline()
        .build(schema)
        .map_err(|e| PaspError::new(code, "invalid record schema").with_source(e))?;
    if validator.is_valid(value) {
        Ok(())
    } else {
        Err(PaspError::new(code, "record schema failure"))
    }
}
