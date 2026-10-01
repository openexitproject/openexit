use crate::{PaspError, Result, integrity, manifest, models::*, paths, schema};
use serde_json::Value;
use std::{
    fs::File,
    io::{BufRead, BufReader},
    path::Path,
};
fn json_file(path: &Path, code: &str) -> Result<Value> {
    serde_json::from_reader(
        File::open(path).map_err(|e| PaspError::new(code, "cannot open JSON").with_source(e))?,
    )
    .map_err(|e| PaspError::new(code, "invalid JSON").with_source(e))
}
fn lines<F>(path: &Path, code: &str, mut f: F) -> Result<()>
where
    F: FnMut(u64, Value) -> Result<()>,
{
    for (i, line) in BufReader::new(
        File::open(path).map_err(|e| PaspError::new(code, "cannot open NDJSON").with_source(e))?,
    )
    .lines()
    .enumerate()
    {
        let line = line.map_err(|e| PaspError::new(code, "cannot read NDJSON").with_source(e))?;
        if line.trim().is_empty() {
            continue;
        }
        f(
            i as u64 + 1,
            serde_json::from_str(&line)
                .map_err(|e| PaspError::new(code, "invalid NDJSON").with_source(e))?,
        )?;
    }
    Ok(())
}
fn u(v: &Value, key: &str, code: &str) -> Result<u64> {
    v.get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| PaspError::new(code, format!("missing {key}")))
}
fn resource(root: &Path, entry: &Value, deep: bool) -> Result<Resource> {
    let name = entry["name"]
        .as_str()
        .ok_or_else(|| PaspError::new("PASP_INVALID_RESOURCE", "invalid resource name"))?;
    let descriptor_ref = entry["descriptor"]
        .as_str()
        .ok_or_else(|| PaspError::new("PASP_INVALID_RESOURCE", "missing descriptor"))?;
    let descriptor = json_file(
        &paths::safe_package_path(root, descriptor_ref)?,
        "PASP_INVALID_RESOURCE",
    )?;
    schema::validate_document("resource", &descriptor, "PASP_INVALID_RESOURCE")?;
    if descriptor["name"].as_str() != Some(name) {
        return Err(PaspError::new(
            "PASP_INVALID_RESOURCE",
            "descriptor name mismatch",
        ));
    }
    let identity = descriptor["identity"]
        .as_array()
        .ok_or_else(|| PaspError::new("PASP_INVALID_RESOURCE", "invalid identity"))?
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let rschema = if let Some(r) = descriptor["schema"].as_str() {
        let p = paths::safe_package_path(root, r)?;
        if !p.is_file() {
            return Err(PaspError::new("PASP_MISSING_SCHEMA", "missing schema"));
        }
        json_file(&p, "PASP_MISSING_SCHEMA")?
    } else {
        descriptor["schema"].clone()
    };
    let chunks = descriptor["chunks"]
        .as_array()
        .ok_or_else(|| PaspError::new("PASP_INVALID_RESOURCE", "invalid chunks"))?;
    let mut total = 0;
    let mut out = Vec::new();
    for (index, raw) in chunks.iter().enumerate() {
        let seq = u(raw, "sequence", "PASP_INVALID_RESOURCE")?;
        let expected = index as u64 + 1;
        let path = raw["path"]
            .as_str()
            .ok_or_else(|| PaspError::new("PASP_INVALID_RESOURCE", "missing chunk path"))?;
        if seq != expected || path != format!("resources/{name}/{expected:08}.ndjson") {
            return Err(PaspError::new(
                "PASP_INVALID_RESOURCE",
                "invalid chunk order/path",
            ));
        }
        let p = paths::safe_package_path(root, path)?;
        if !p.is_file() {
            return Err(PaspError::new("PASP_INVALID_RESOURCE", "missing chunk"));
        }
        let records = u(raw, "recordCount", "PASP_INVALID_RESOURCE")?;
        let bytes = u(raw, "uncompressedBytes", "PASP_INVALID_RESOURCE")?;
        let sha = raw["sha256"]
            .as_str()
            .ok_or_else(|| PaspError::new("PASP_INVALID_RESOURCE", "missing chunk checksum"))?;
        if deep {
            integrity::verify_file(&p, sha, bytes)?;
            let mut count = 0;
            lines(&p, "PASP_INVALID_RECORD", |line, record| {
                if !record.is_object() || identity.iter().any(|id| !record.get(id).is_some()) {
                    return Err(PaspError::new(
                        "PASP_INVALID_RECORD",
                        format!("invalid record at {path}:{line}"),
                    ));
                }
                schema::validate_customer(&rschema, &record, "PASP_INVALID_RECORD")?;
                count += 1;
                Ok(())
            })?;
            if count != records {
                return Err(PaspError::new(
                    "PASP_INVALID_RESOURCE",
                    "chunk record count mismatch",
                ));
            }
        }
        total += records;
        out.push(ResourceChunk {
            sequence: seq,
            path: path.into(),
            record_count: records,
            uncompressed_bytes: bytes,
            sha256: sha.into(),
        });
    }
    if total != u(&descriptor, "recordCount", "PASP_INVALID_RESOURCE")? {
        return Err(PaspError::new(
            "PASP_INVALID_RESOURCE",
            "resource record count mismatch",
        ));
    }
    Ok(Resource {
        name: name.into(),
        schema: rschema,
        identity,
        record_count: descriptor["recordCount"].as_u64().unwrap_or(0),
        chunks: out,
        descriptor: descriptor_ref.into(),
    })
}
fn assets(root: &Path, raw: &Value, deep: bool) -> Result<AssetSummary> {
    let count = u(raw, "count", "PASP_MISSING_ASSET")?;
    let total_bytes = u(raw, "totalBytes", "PASP_MISSING_ASSET")?;
    let index = raw["index"].as_str().map(str::to_owned);
    if count == 0 && index.is_none() {
        return Ok(AssetSummary {
            count,
            total_bytes,
            index,
        });
    }
    let p = paths::safe_package_path(root, index.as_deref().unwrap_or("assets/index.ndjson"))?;
    if !p.is_file() {
        return Err(PaspError::new("PASP_MISSING_ASSET", "missing asset index"));
    }
    let mut seen = 0;
    let mut bytes = 0;
    lines(&p, "PASP_MISSING_ASSET", |_line, asset| {
        schema::validate_document("asset", &asset, "PASP_MISSING_ASSET")?;
        let ap = paths::safe_package_path(root, asset["path"].as_str().unwrap_or(""))?;
        if !ap.is_file() {
            return Err(PaspError::new("PASP_MISSING_ASSET", "missing asset"));
        }
        if deep {
            integrity::verify_file(
                &ap,
                asset["sha256"].as_str().unwrap_or(""),
                asset["byteLength"].as_u64().unwrap_or(0),
            )?;
        }
        seen += 1;
        bytes += asset["byteLength"].as_u64().unwrap_or(0);
        Ok(())
    })?;
    if seen != count || bytes != total_bytes {
        return Err(PaspError::new(
            "PASP_MISSING_ASSET",
            "asset summary mismatch",
        ));
    }
    Ok(AssetSummary {
        count,
        total_bytes,
        index,
    })
}
#[allow(clippy::collapsible_if)]
fn inspect(root: &Path, deep: bool) -> Result<InspectionResult> {
    if !root.is_dir() {
        return Err(PaspError::new(
            "PASP_MALFORMED_PACKAGE",
            "not a PASP directory",
        ));
    }
    let mp = paths::safe_package_path(root, "manifest.json")?;
    if !mp.is_file() {
        return Err(PaspError::new(
            "PASP_MALFORMED_PACKAGE",
            "missing manifest.json",
        ));
    }
    let value = manifest::parse_manifest_file(mp)?;
    let manifest = manifest::validate_manifest(&value)?;
    let raw = manifest
        .raw
        .as_object()
        .ok_or_else(|| PaspError::new("PASP_INVALID_MANIFEST", "manifest object"))?;
    let entries = raw["resources"]
        .as_array()
        .ok_or_else(|| PaspError::new("PASP_INVALID_MANIFEST", "resources array"))?;
    let names = entries
        .iter()
        .filter_map(|e| e["name"].as_str().map(str::to_owned))
        .collect::<std::collections::HashSet<_>>();
    let resources = entries
        .iter()
        .map(|e| resource(root, e, deep))
        .collect::<Result<Vec<_>>>()?;
    let asset = assets(root, &raw["assets"], deep)?;
    let rel_count = if let Some(reference) = raw.get("relationships").and_then(Value::as_str) {
        let arr = json_file(
            &paths::safe_package_path(root, reference)?,
            "PASP_INVALID_RELATIONSHIP",
        )?;
        let arr = arr.as_array().ok_or_else(|| {
            PaspError::new(
                "PASP_INVALID_RELATIONSHIP",
                "relationships must be an array",
            )
        })?;
        for rel in arr {
            schema::validate_document("relationship", rel, "PASP_INVALID_RELATIONSHIP")?;
            if !names.contains(rel["from"]["resource"].as_str().unwrap_or(""))
                || !names.contains(rel["to"]["resource"].as_str().unwrap_or(""))
            {
                return Err(PaspError::new(
                    "PASP_INVALID_RELATIONSHIP",
                    "missing endpoint resource",
                ));
            }
        }
        arr.len() as u64
    } else {
        0
    };
    if deep {
        if let Some(reference) = raw
            .get("integrity")
            .and_then(|v| v.get("checksums"))
            .and_then(Value::as_str)
        {
            let index = paths::safe_package_path(root, reference)?;
            let file = File::open(&index).map_err(|e| {
                PaspError::new("PASP_MALFORMED_PACKAGE", "cannot read checksums index")
                    .with_source(e)
            })?;
            for (line_no, line) in BufReader::new(file).lines().enumerate() {
                let line = line.map_err(|e| {
                    PaspError::new("PASP_MALFORMED_PACKAGE", "cannot read checksums index")
                        .with_source(e)
                })?;
                if line.trim().is_empty() {
                    continue;
                }
                let mut parts = line.splitn(2, char::is_whitespace);
                let expected = parts.next().unwrap_or("");
                let path = parts.next().unwrap_or("").trim_start();
                if expected.len() != 64
                    || !expected
                        .bytes()
                        .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
                    || path.is_empty()
                {
                    return Err(PaspError::new(
                        "PASP_MALFORMED_PACKAGE",
                        format!("invalid checksums index line {}", line_no + 1),
                    ));
                }
                let target = paths::safe_package_path(root, path)?;
                if !target.is_file() {
                    return Err(PaspError::new(
                        "PASP_MALFORMED_PACKAGE",
                        "missing checksummed file",
                    ));
                }
                let (actual, _) = integrity::hash_file(&target)?;
                if actual != expected {
                    return Err(PaspError::new(
                        "PASP_CHECKSUM_MISMATCH",
                        "checksum index mismatch",
                    ));
                }
            }
        }
    }
    let scope = serde_json::from_value(raw["scope"].clone())
        .map_err(|e| PaspError::new("PASP_INVALID_MANIFEST", "invalid scope").with_source(e))?;
    let producer = serde_json::from_value(raw["producer"].clone())
        .map_err(|e| PaspError::new("PASP_INVALID_MANIFEST", "invalid producer").with_source(e))?;
    let consistency = serde_json::from_value(raw["consistency"].clone()).map_err(|e| {
        PaspError::new("PASP_INVALID_MANIFEST", "invalid consistency").with_source(e)
    })?;
    let integrity = serde_json::from_value(raw["integrity"].clone())
        .map_err(|e| PaspError::new("PASP_INVALID_MANIFEST", "invalid integrity").with_source(e))?;
    Ok(InspectionResult {
        valid: true,
        pasp_version: raw["paspVersion"].as_str().unwrap_or("").into(),
        package_id: raw["packageId"].as_str().unwrap_or("").into(),
        export_id: raw["exportId"].as_str().unwrap_or("").into(),
        scope,
        producer,
        consistency,
        resources,
        assets: asset,
        relationship_count: rel_count,
        integrity,
        verified: deep,
    })
}
pub fn inspect_bundle<P: AsRef<Path>>(path: P) -> Result<InspectionResult> {
    inspect(path.as_ref(), false)
}
pub fn verify_bundle<P: AsRef<Path>>(path: P) -> Result<InspectionResult> {
    inspect(path.as_ref(), true)
}
