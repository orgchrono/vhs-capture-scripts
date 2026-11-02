//! Pure Functional Domain Model for Storage Providers, Quota Verification, and Chunk Planning.
//!
//! Models storage backends (Local/NAS/USB, Google Drive, Supabase, Dropbox, OneDrive, S3),
//! validates configuration dictionaries, verifies capacity against required ingest quotas,
//! and plans chunked multipart uploads with zero I/O or side-effects.

use serde::{Deserialize, Serialize};

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
    let safety_margin = 1_073_741_824; // 1 GB safety margin
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_chunk_plan_splits_evenly() {
        let plan = calculate_chunk_plan(100, 25);
        assert_eq!(plan.len(), 4);
        assert_eq!(plan[0].part_number, 1);
        assert_eq!(plan[0].start_byte, 0);
        assert_eq!(plan[0].end_byte, 24);
        assert!(!plan[0].is_last);
        assert_eq!(plan[3].part_number, 4);
        assert_eq!(plan[3].start_byte, 75);
        assert_eq!(plan[3].end_byte, 99);
        assert!(plan[3].is_last);
    }

    #[test]
    fn test_format_destination_key_normalizes_slashes() {
        assert_eq!(format_destination_key("vhs/raw", "tape01.mkv"), "vhs/raw/tape01.mkv");
        assert_eq!(format_destination_key("/vhs/raw/", "/tape01.mkv/"), "vhs/raw/tape01.mkv");
        assert_eq!(format_destination_key("vhs\\raw", "folder\\tape01.mkv"), "vhs/raw/folder/tape01.mkv");
    }

    #[test]
    fn test_verify_capacity_requires_1gb_safety_margin() {
        assert!(verify_capacity(2_000_000_000, 500_000_000).is_ok());
        assert!(verify_capacity(1_000_000_000, 500_000_000).is_err());
    }
}
