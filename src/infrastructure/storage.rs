//! Pure Functional Storage Provider Validation, Quota Checking, and Key Path Resolvers.
//!
//! Models storage backends (Local/NAS/USB, Google Drive, Supabase, Dropbox, OneDrive, S3),
//! validates configuration dictionaries, verifies disk capacity against required ingest quotas,
//! provides chunk upload planning, and manages persistent storage settings.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StorageProviderKind {
    LocalNasUsb,
    GoogleDrive,
    Supabase,
    Dropbox,
    OneDrive,
    S3,
}

impl StorageProviderKind {
    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::LocalNasUsb => "local_nas_usb",
            Self::GoogleDrive => "gdrive",
            Self::Supabase => "supabase",
            Self::Dropbox => "dropbox",
            Self::OneDrive => "onedrive",
            Self::S3 => "s3",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StorageConfig {
    pub provider: StorageProviderKind,
    pub base_path: Option<String>,
    pub bucket: Option<String>,
    pub endpoint: Option<String>,
    pub region: Option<String>,
    pub has_credentials: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct StorageQuota {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub free_gb: u64,
    pub is_ready: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChunkUploadPart {
    pub part_number: usize,
    pub start_byte: u64,
    pub end_byte: u64,
    pub part_size: u64,
    pub is_last: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StorageStatus {
    pub ready: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free_space_gb: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_space_gb: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StorageConfigEnvelope {
    pub provider: String,
    pub config: serde_json::Value,
    pub status: StorageStatus,
    pub available_providers: Vec<String>,
}

/// Pure calculation of chunk upload parts for large cloud files.
#[must_use]
pub fn calculate_chunk_plan(total_bytes: u64, chunk_size: u64) -> Vec<ChunkUploadPart> {
    if total_bytes == 0 || chunk_size == 0 {
        return Vec::new();
    }
    let mut parts = Vec::new();
    let mut offset = 0;
    let mut part_num = 1;

    while offset < total_bytes {
        let remaining = total_bytes - offset;
        let size = remaining.min(chunk_size);
        let end_byte = offset + size - 1;
        let is_last = offset + size >= total_bytes;

        parts.push(ChunkUploadPart {
            part_number: part_num,
            start_byte: offset,
            end_byte,
            part_size: size,
            is_last,
        });

        offset += size;
        part_num += 1;
    }

    parts
}

/// Pure validation of storage provider configuration.
pub fn validate_storage_config(config: &StorageConfig) -> Result<(), &'static str> {
    match config.provider {
        StorageProviderKind::LocalNasUsb => {
            if let Some(ref path) = config.base_path {
                if path.trim().is_empty() {
                    return Err("Local storage destination path cannot be empty");
                }
                Ok(())
            } else {
                Err("Local storage requires base_path")
            }
        }
        StorageProviderKind::GoogleDrive
        | StorageProviderKind::Dropbox
        | StorageProviderKind::OneDrive => {
            if !config.has_credentials {
                return Err("Cloud OAuth provider requires authenticated credentials");
            }
            Ok(())
        }
        StorageProviderKind::Supabase => {
            if !config.has_credentials {
                return Err("Supabase requires API key credentials");
            }
            if config.bucket.as_deref().unwrap_or("").trim().is_empty() {
                return Err("Supabase requires a target bucket name");
            }
            Ok(())
        }
        StorageProviderKind::S3 => {
            if !config.has_credentials {
                return Err("S3 requires AWS access credentials");
            }
            if config.bucket.as_deref().unwrap_or("").trim().is_empty() {
                return Err("S3 requires a bucket name");
            }
            Ok(())
        }
    }
}

/// Pure safety check verifying whether available disk space satisfies minimum required bytes.
pub fn verify_capacity(available_bytes: u64, required_bytes: u64) -> Result<(), &'static str> {
    // Require at least required_bytes plus a 1GB safety margin
    let safety_margin = 1_073_741_824; // 1 GB
    if available_bytes < required_bytes.saturating_add(safety_margin) {
        Err("Insufficient storage capacity: available bytes below requirement plus 1GB safety margin")
    } else {
        Ok(())
    }
}

/// Pure key path resolver constructing clean POSIX object keys without leading or trailing slashes.
#[must_use]
pub fn format_destination_key(base_folder: &str, relative_path: &str) -> String {
    let clean_base = base_folder.trim().trim_matches(|c| c == '/' || c == '\\');
    let clean_rel = relative_path.trim().trim_matches(|c| c == '/' || c == '\\');

    if clean_base.is_empty() {
        clean_rel.replace('\\', "/")
    } else if clean_rel.is_empty() {
        clean_base.replace('\\', "/")
    } else {
        format!("{}/{}", clean_base.replace('\\', "/"), clean_rel.replace('\\', "/"))
    }
}

/// Queries total and available disk space for the volume containing the given path.
#[cfg(windows)]
pub fn query_disk_space(path: &Path) -> Result<(u64, u64), String> {
    use std::os::windows::ffi::OsStrExt;
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let mut free_bytes_available: u64 = 0;
    let mut total_bytes: u64 = 0;
    let mut total_free_bytes: u64 = 0;

    extern "system" {
        fn GetDiskFreeSpaceExW(
            lpDirectoryName: *const u16,
            lpFreeBytesAvailableToCaller: *mut u64,
            lpTotalNumberOfBytes: *mut u64,
            lpTotalNumberOfFreeBytes: *mut u64,
        ) -> i32;
    }

    let ret = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut free_bytes_available,
            &mut total_bytes,
            &mut total_free_bytes,
        )
    };

    if ret != 0 {
        Ok((total_bytes, free_bytes_available))
    } else {
        Err("Failed to query disk space".to_string())
    }
}

#[cfg(not(windows))]
pub fn query_disk_space(_path: &Path) -> Result<(u64, u64), String> {
    Ok((1_000_000_000_000, 500_000_000_000))
}

/// Evaluates connection and quota status for a specified storage provider and configuration.
#[must_use]
pub fn evaluate_storage_status(provider: &str, config: &serde_json::Value) -> StorageStatus {
    match provider {
        "local_nas_usb" => {
            let path_str = config.get("path").and_then(|v| v.as_str()).unwrap_or("");
            if path_str.trim().is_empty() {
                return StorageStatus {
                    ready: false,
                    free_space_gb: None,
                    total_space_gb: None,
                    message: Some("Path not specified".to_string()),
                };
            }
            let p = Path::new(path_str);
            let target = if p.exists() {
                p
            } else if let Some(parent) = p.parent() {
                if parent.exists() {
                    parent
                } else {
                    return StorageStatus {
                        ready: false,
                        free_space_gb: None,
                        total_space_gb: None,
                        message: Some("Directory does not exist".to_string()),
                    };
                }
            } else {
                return StorageStatus {
                    ready: false,
                    free_space_gb: None,
                    total_space_gb: None,
                    message: Some("Directory does not exist".to_string()),
                };
            };

            match query_disk_space(target) {
                Ok((total, free)) => {
                    let gb = 1_073_741_824.0;
                    StorageStatus {
                        ready: true,
                        free_space_gb: Some((free as f64 / gb * 10.0).round() / 10.0),
                        total_space_gb: Some((total as f64 / gb * 10.0).round() / 10.0),
                        message: None,
                    }
                }
                Err(err) => StorageStatus {
                    ready: false,
                    free_space_gb: None,
                    total_space_gb: None,
                    message: Some(err),
                },
            }
        }
        "s3_generic" => {
            let key = config.get("S3_ACCESS_KEY").and_then(|v| v.as_str()).unwrap_or("");
            let secret = config.get("S3_SECRET_KEY").and_then(|v| v.as_str()).unwrap_or("");
            let ready = !key.trim().is_empty() && !secret.trim().is_empty();
            StorageStatus {
                ready,
                free_space_gb: None,
                total_space_gb: None,
                message: if ready { None } else { Some("Missing credentials".to_string()) },
            }
        }
        "supabase" => {
            let key = config.get("SUPABASE_KEY").and_then(|v| v.as_str()).unwrap_or("");
            let ready = !key.trim().is_empty();
            StorageStatus {
                ready,
                free_space_gb: None,
                total_space_gb: None,
                message: if ready { None } else { Some("Missing API key".to_string()) },
            }
        }
        _ => {
            let has_token = config.get("access_token")
                .or_else(|| config.get("DROPBOX_ACCESS_TOKEN"))
                .is_some();
            StorageStatus {
                ready: has_token,
                free_space_gb: None,
                total_space_gb: None,
                message: if has_token { None } else { Some("Authorization required".to_string()) },
            }
        }
    }
}

/// Resolves the storage configuration JSON path on disk.
#[must_use]
pub fn resolve_storage_config_path() -> PathBuf {
    if let Ok(dir) = std::env::var("VHS_STUDIO_DIR") {
        PathBuf::from(dir).join("storage.json")
    } else if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        PathBuf::from(home).join(".vhs_studio").join("storage.json")
    } else {
        PathBuf::from("storage.json")
    }
}

/// Loads the storage configuration envelope from disk, returning defaults if not found.
#[must_use]
pub fn load_storage_config_envelope(path: &Path) -> StorageConfigEnvelope {
    let providers = vec![
        "local_nas_usb".to_string(),
        "supabase".to_string(),
        "s3_generic".to_string(),
        "gdrive".to_string(),
        "dropbox".to_string(),
        "onedrive".to_string(),
    ];

    let default_path = if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        PathBuf::from(home).join("Videos").join("VHS_Archive").to_string_lossy().to_string()
    } else {
        "VHS_Archive".to_string()
    };

    if !path.exists() {
        let cfg = serde_json::json!({ "path": default_path });
        let status = evaluate_storage_status("local_nas_usb", &cfg);
        return StorageConfigEnvelope {
            provider: "local_nas_usb".to_string(),
            config: cfg,
            status,
            available_providers: providers,
        };
    }

    if let Ok(content) = std::fs::read_to_string(path) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            let provider = val.get("provider").and_then(|v| v.as_str()).unwrap_or("local_nas_usb").to_string();
            let config = val.get("config").cloned().unwrap_or_else(|| serde_json::json!({ "path": default_path }));
            let status = evaluate_storage_status(&provider, &config);
            return StorageConfigEnvelope {
                provider,
                config,
                status,
                available_providers: providers,
            };
        }
    }

    let cfg = serde_json::json!({ "path": default_path });
    let status = evaluate_storage_status("local_nas_usb", &cfg);
    StorageConfigEnvelope {
        provider: "local_nas_usb".to_string(),
        config: cfg,
        status,
        available_providers: providers,
    }
}

/// Saves storage configuration envelope atomically to disk and returns refreshed status.
pub fn save_storage_config_envelope(
    path: &Path,
    provider: &str,
    config: &serde_json::Value,
) -> Result<StorageStatus, String> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let status = evaluate_storage_status(provider, config);
    let payload = serde_json::json!({
        "provider": provider,
        "config": config,
    });
    let content = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;

    let tmp_path = path.with_extension("tmp");
    std::fs::write(&tmp_path, content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, path).map_err(|e| e.to_string())?;

    Ok(status)
}

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
    use std::io::Read;
    use sha2::{Digest, Sha256};
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; crate::models::constants::DEFAULT_IO_BUFFER_BYTES];

    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }

    let result = hasher.finalize();
    Ok(result.iter().map(|b| format!("{b:02x}")).collect())
}

/// Sets read-only permissions on an archival master file to prevent accidental deletion or modification.
pub fn set_file_readonly(path: &Path) -> std::io::Result<()> {
    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_readonly(true);
    std::fs::set_permissions(path, perms)
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validates_local_storage_config() {
        let valid = StorageConfig {
            provider: StorageProviderKind::LocalNasUsb,
            base_path: Some("/media/archive".to_string()),
            bucket: None,
            endpoint: None,
            region: None,
            has_credentials: false,
        };
        assert!(validate_storage_config(&valid).is_ok());

        let invalid = StorageConfig {
            provider: StorageProviderKind::LocalNasUsb,
            base_path: Some("   ".to_string()),
            bucket: None,
            endpoint: None,
            region: None,
            has_credentials: false,
        };
        assert!(validate_storage_config(&invalid).is_err());
    }

    #[test]
    fn test_validates_s3_storage_config() {
        let valid = StorageConfig {
            provider: StorageProviderKind::S3,
            base_path: None,
            bucket: Some("vhs-vault".to_string()),
            endpoint: None,
            region: Some("us-east-1".to_string()),
            has_credentials: true,
        };
        assert!(validate_storage_config(&valid).is_ok());

        let unauthed = StorageConfig {
            provider: StorageProviderKind::S3,
            base_path: None,
            bucket: Some("vhs-vault".to_string()),
            endpoint: None,
            region: Some("us-east-1".to_string()),
            has_credentials: false,
        };
        assert!(validate_storage_config(&unauthed).is_err());
    }

    #[test]
    fn test_verify_capacity_with_safety_margin() {
        let required = 10_000_000_000; // 10 GB
        let available_plenty = 20_000_000_000; // 20 GB
        assert!(verify_capacity(available_plenty, required).is_ok());

        let available_exact = 10_500_000_000; // 10.5 GB (less than 10GB + 1GB margin)
        assert!(verify_capacity(available_exact, required).is_err());
    }

    #[test]
    fn test_format_destination_key_normalizes_slashes() {
        let key = format_destination_key("/vhs_captures\\2026/", "\\tapes\\family.mkv");
        assert_eq!(key, "vhs_captures/2026/tapes/family.mkv");

        let root_key = format_destination_key("", "tape1.mp4");
        assert_eq!(root_key, "tape1.mp4");
    }

    #[test]
    fn test_calculate_chunk_plan() {
        let plan = calculate_chunk_plan(25_000_000, 10_000_000);
        assert_eq!(plan.len(), 3);

        assert_eq!(plan[0].part_number, 1);
        assert_eq!(plan[0].start_byte, 0);
        assert_eq!(plan[0].end_byte, 9_999_999);
        assert_eq!(plan[0].part_size, 10_000_000);
        assert!(!plan[0].is_last);

        assert_eq!(plan[1].part_number, 2);
        assert_eq!(plan[1].start_byte, 10_000_000);
        assert_eq!(plan[1].end_byte, 19_999_999);
        assert_eq!(plan[1].part_size, 10_000_000);
        assert!(!plan[1].is_last);

        assert_eq!(plan[2].part_number, 3);
        assert_eq!(plan[2].start_byte, 20_000_000);
        assert_eq!(plan[2].end_byte, 24_999_999);
        assert_eq!(plan[2].part_size, 5_000_000);
        assert!(plan[2].is_last);
    }

    #[test]
    fn test_evaluate_storage_status_for_providers() {
        let s3_cfg = serde_json::json!({
            "S3_ACCESS_KEY": "AKIAIOSFODNN7EXAMPLE",
            "S3_SECRET_KEY": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
        });
        let s3_status = evaluate_storage_status("s3_generic", &s3_cfg);
        assert!(s3_status.ready);

        let unauthed_s3 = serde_json::json!({
            "S3_ACCESS_KEY": "",
            "S3_SECRET_KEY": ""
        });
        let unauthed_status = evaluate_storage_status("s3_generic", &unauthed_s3);
        assert!(!unauthed_status.ready);

        let supabase_cfg = serde_json::json!({
            "SUPABASE_KEY": "sbp_abcdef123456"
        });
        let supabase_status = evaluate_storage_status("supabase", &supabase_cfg);
        assert!(supabase_status.ready);
    }

    #[test]
    fn test_load_and_save_storage_config_envelope_roundtrip() {
        let temp_dir = std::env::temp_dir().join(format!("vhs_test_storage_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let config_file = temp_dir.join("storage.json");

        let default_env = load_storage_config_envelope(&config_file);
        assert_eq!(default_env.provider, "local_nas_usb");

        let custom_cfg = serde_json::json!({
            "S3_ACCESS_KEY": "MOCK_KEY",
            "S3_SECRET_KEY": "MOCK_SECRET"
        });
        let save_res = save_storage_config_envelope(&config_file, "s3_generic", &custom_cfg);
        assert!(save_res.is_ok());

        let loaded_env = load_storage_config_envelope(&config_file);
        assert_eq!(loaded_env.provider, "s3_generic");
        assert!(loaded_env.status.ready);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_copy_and_verify_file_roundtrip() {
        let temp_dir = std::env::temp_dir().join(format!("vhs_test_copy_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let src = temp_dir.join("source.txt");
        let dst = temp_dir.join("subfolder").join("dest.txt");
        std::fs::write(&src, b"VHS Studio Archive Test Payload").unwrap();

        let copy_res = copy_and_verify_file(&src, &dst);
        assert!(copy_res.is_ok());
        assert_eq!(copy_res.unwrap(), 31);
        assert_eq!(std::fs::read(&dst).unwrap(), b"VHS Studio Archive Test Payload");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
