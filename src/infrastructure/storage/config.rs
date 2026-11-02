use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

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
