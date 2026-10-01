use crate::{InspectionResult, Result, inspection};
use std::path::{Path, PathBuf};
#[derive(Debug, Clone)]
pub struct Bundle {
    path: PathBuf,
}
impl Bundle {
    pub fn open<P: AsRef<Path>>(path: P) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
        }
    }
    pub fn inspect(&self) -> Result<InspectionResult> {
        inspection::inspect_bundle(&self.path)
    }
    pub fn verify(&self) -> Result<InspectionResult> {
        inspection::verify_bundle(&self.path)
    }
}
