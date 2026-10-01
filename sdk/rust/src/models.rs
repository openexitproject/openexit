use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Scope {
    #[serde(rename = "type")]
    pub kind: String,
    pub id: String,
    #[serde(default)]
    pub metadata: Map<String, Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProducerInfo {
    pub name: String,
    pub version: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct IntegrityInfo {
    pub algorithm: String,
    pub checksums: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Consistency {
    pub level: ConsistencyLevel,
    #[serde(default)]
    pub metadata: Map<String, Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ConsistencyLevel {
    Snapshot,
    Bounded,
    BestEffort,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ResourceChunk {
    pub sequence: u64,
    pub path: String,
    #[serde(rename = "recordCount")]
    pub record_count: u64,
    #[serde(rename = "uncompressedBytes")]
    pub uncompressed_bytes: u64,
    pub sha256: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Resource {
    pub name: String,
    pub schema: Value,
    pub identity: Vec<String>,
    #[serde(rename = "recordCount")]
    pub record_count: u64,
    pub chunks: Vec<ResourceChunk>,
    pub descriptor: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AssetSummary {
    pub count: u64,
    #[serde(rename = "totalBytes")]
    pub total_bytes: u64,
    pub index: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RelationshipEndpoint {
    pub resource: String,
    pub pointer: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Relationship {
    pub id: String,
    pub from: RelationshipEndpoint,
    pub to: RelationshipEndpoint,
    pub cardinality: String,
    #[serde(default)]
    pub metadata: Map<String, Value>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Manifest {
    pub raw: Value,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InspectionResult {
    pub valid: bool,
    #[serde(rename = "paspVersion")]
    pub pasp_version: String,
    #[serde(rename = "packageId")]
    pub package_id: String,
    #[serde(rename = "exportId")]
    pub export_id: String,
    pub scope: Scope,
    pub producer: ProducerInfo,
    pub consistency: Consistency,
    pub resources: Vec<Resource>,
    pub assets: AssetSummary,
    #[serde(rename = "relationshipCount")]
    pub relationship_count: u64,
    pub integrity: IntegrityInfo,
    pub verified: bool,
}
