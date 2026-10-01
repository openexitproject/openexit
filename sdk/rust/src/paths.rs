use crate::{PaspError, Result};
use std::path::{Path, PathBuf};

pub fn validate_package_path(value: &str) -> Result<()> {
    if value.is_empty()
        || value.contains('\0')
        || value.contains('\\')
        || value.starts_with('/')
        || value.starts_with('~')
        || value.as_bytes().get(1) == Some(&b':')
        || value
            .split('/')
            .any(|p| p.is_empty() || p == "." || p == "..")
    {
        return Err(PaspError::new(
            "PASP_PATH_TRAVERSAL",
            format!("unsafe package path: {value}"),
        ));
    }
    Ok(())
}
pub fn safe_package_path(root: &Path, value: &str) -> Result<PathBuf> {
    validate_package_path(value)?;
    let base = root.canonicalize().map_err(|e| {
        PaspError::new("PASP_MALFORMED_PACKAGE", "cannot resolve package root").with_source(e)
    })?;
    let candidate = value.split('/').fold(base.clone(), |p, part| p.join(part));
    let check = if candidate.exists() {
        candidate.canonicalize().map_err(|e| {
            PaspError::new("PASP_PATH_TRAVERSAL", "cannot resolve package path").with_source(e)
        })?
    } else {
        candidate.clone()
    };
    if !check.starts_with(&base) {
        return Err(PaspError::new(
            "PASP_PATH_TRAVERSAL",
            format!("path escapes package: {value}"),
        ));
    }
    Ok(candidate)
}
