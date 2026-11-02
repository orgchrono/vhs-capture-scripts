use std::path::Path;

/// Copies a file to a destination path and verifies byte length integrity.
pub fn copy_and_verify_file(source: &Path, destination: &Path) -> Result<u64, String> {
    if !source.exists() {
        return Err(format!("Source file does not exist: {}", source.display()));
    }
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let bytes_copied = std::fs::copy(source, destination).map_err(|e| e.to_string())?;
    let src_len = std::fs::metadata(source).map_err(|e| e.to_string())?.len();
    let dst_len = std::fs::metadata(destination).map_err(|e| e.to_string())?.len();

    if src_len != dst_len {
        let _ = std::fs::remove_file(destination);
        return Err(format!("Copy verification failed: source length {} != dest length {}", src_len, dst_len));
    }

    Ok(bytes_copied)
}

/// Computes a lowercase hexadecimal SHA-256 digest of an on-disk file in streaming chunks.
pub fn compute_file_sha256_hex(path: &Path) -> Result<String, std::io::Error> {
    let file = std::fs::File::open(path)?;
    crate::domain::fixity::compute_reader_sha256_hex(file)
}

/// Sets read-only permissions on an archival master file to prevent accidental deletion or modification.
pub fn set_file_readonly(path: &Path) -> std::io::Result<()> {
    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_readonly(true);
    std::fs::set_permissions(path, perms)
}
