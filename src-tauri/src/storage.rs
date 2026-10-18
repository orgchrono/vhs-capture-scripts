//! Pure Functional Storage Provider Validation, Quota Checking, and Key Path Resolvers.
//!
//! Models storage backends (Local/NAS/USB, Google Drive, Supabase, Dropbox, OneDrive, S3),
//! validates configuration dictionaries, and verifies disk capacity against required ingest quotas.

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
}
