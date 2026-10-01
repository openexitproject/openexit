use crate::{PaspError, Result};
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{BufReader, Read},
    path::Path,
};

pub fn hash_file(path: &Path) -> Result<(String, u64)> {
    let file = File::open(path).map_err(|e| {
        PaspError::new(
            "PASP_MALFORMED_PACKAGE",
            format!("cannot read file: {}", path.display()),
        )
        .with_source(e)
    })?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    let mut count = 0u64;
    loop {
        let n = reader.read(&mut buffer).map_err(|e| {
            PaspError::new("PASP_MALFORMED_PACKAGE", "cannot read file").with_source(e)
        })?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
        count += n as u64;
    }
    Ok((format!("{:x}", hasher.finalize()), count))
}
pub fn verify_file(path: &Path, expected: &str, bytes: u64) -> Result<()> {
    let (actual, length) = hash_file(path)?;
    if actual != expected || length != bytes {
        return Err(PaspError::new(
            "PASP_CHECKSUM_MISMATCH",
            format!("checksum or length mismatch: {}", path.display()),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::hash_file;
    use std::io::Write;
    #[test]
    fn hashes_a_file_with_multiple_reads() {
        let path = std::env::temp_dir().join(format!("openexit-large-{}", std::process::id()));
        let mut file = std::fs::File::create(&path).unwrap();
        let block = vec![0x5au8; 1024 * 1024];
        for _ in 0..3 {
            file.write_all(&block).unwrap();
        }
        drop(file);
        let (digest, bytes) = hash_file(&path).unwrap();
        assert_eq!(bytes, 3 * 1024 * 1024);
        assert_eq!(digest.len(), 64);
        std::fs::remove_file(path).unwrap();
    }
}
