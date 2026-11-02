use std::path::{Path, PathBuf};
use super::file_ops::compute_file_sha256_hex;

/// Audits an OAIS package directory against its SHA-256 manifest from disk.
pub fn verify_oais_directory(
    package_dir: &Path,
) -> Result<crate::domain::archive::OaisVerificationReport, Box<dyn std::error::Error>> {
    if !package_dir.is_dir() {
        return Err(format!("'{}' is not a valid directory.", package_dir.display()).into());
    }

    let mut manifest_path_opt: Option<PathBuf> = None;
    for entry in std::fs::read_dir(package_dir)? {
        let entry = entry?;
        let p = entry.path();
        if p.is_file() {
            let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or_default();
            if fname.ends_with("_manifest-sha256.txt") || fname == "manifest-sha256.txt" {
                manifest_path_opt = Some(p);
                break;
            }
        }
    }

    let manifest_path = match manifest_path_opt {
        Some(p) => p,
        None => {
            return Err(format!(
                "No OAIS SHA-256 manifest (*_manifest-sha256.txt) found in '{}'",
                package_dir.display()
            )
            .into());
        }
    };

    let manifest_content = std::fs::read_to_string(&manifest_path)?;
    let mut valid_files = Vec::new();
    let mut corrupted_files = Vec::new();
    let mut missing_files = Vec::new();

    for line in manifest_content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let mut parts = trimmed.split_whitespace();
        let expected_hash = match parts.next() {
            Some(h) => h,
            None => continue,
        };
        let rel_filename = match parts.collect::<Vec<&str>>().join(" ") {
            s if !s.is_empty() => s,
            _ => continue,
        };

        let candidate_path = package_dir.join(&rel_filename);
        let target_path = if candidate_path.is_file() {
            candidate_path
        } else if let Some(stripped) = rel_filename.strip_prefix("data/") {
            package_dir.join(stripped)
        } else {
            candidate_path
        };

        if !target_path.is_file() {
            missing_files.push(rel_filename);
            continue;
        }

        let computed_hash = compute_file_sha256_hex(&target_path)?;
        if computed_hash.eq_ignore_ascii_case(expected_hash) {
            valid_files.push(rel_filename);
        } else {
            corrupted_files.push(rel_filename);
        }
    }

    let total_files_checked = valid_files.len() + corrupted_files.len() + missing_files.len();
    let is_valid = missing_files.is_empty() && corrupted_files.is_empty() && !valid_files.is_empty();

    Ok(crate::domain::archive::OaisVerificationReport {
        package_dir: package_dir.to_string_lossy().to_string(),
        manifest_file: manifest_path.file_name().unwrap_or_default().to_string_lossy().to_string(),
        total_files_checked,
        valid_files,
        corrupted_files,
        missing_files,
        is_valid,
    })
}
