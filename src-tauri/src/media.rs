//! Media Utilities, Directory Scanning, Atomic Part Paths, and Timecode Engine.
//!
//! Pure functional file classification, broadcast timecode generation,
//! SHA-256 parameter hashing, and atomic .part path resolution.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

pub const VALID_MEDIA_EXTENSIONS: &[&str] = &[
    "mkv", "avi", "mov", "mp4", "ts", "mpg", "m2ts",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaFileEntry {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub size_mb: f64,
    pub extension: String,
}

/// Pure checker determining if a given extension is an authorized broadcast media format.
#[must_use]
pub fn is_valid_media_extension(ext: &str) -> bool {
    let clean = ext.trim_start_matches('.').to_ascii_lowercase();
    VALID_MEDIA_EXTENSIONS.contains(&clean.as_str())
}

/// Canonical HH:MM:SS[.mmm] broadcast timecode formatter.
#[must_use]
pub fn seconds_to_timecode(seconds: f64, include_ms: bool) -> String {
    if seconds <= 0.0 || seconds.is_nan() || seconds.is_infinite() {
        return if include_ms {
            "00:00:00.000".to_string()
        } else {
            "00:00:00".to_string()
        };
    }

    let hrs = (seconds / 3600.0).floor() as u64;
    let rem = seconds % 3600.0;
    let mins = (rem / 60.0).floor() as u64;
    let secs = rem % 60.0;

    if include_ms {
        format!("{:02}:{:02}:{:06.3}", hrs, mins, secs)
    } else {
        format!("{:02}:{:02}:{:02}", hrs, mins, secs.floor() as u64)
    }
}

/// Resolves atomic intermediate path by appending `.part`.
#[must_use]
pub fn get_part_path(final_path: &str) -> String {
    format!("{}.part", final_path)
}

/// Generates an 8-character SHA-256 hash representing a parameter dictionary or configuration slice.
#[must_use]
pub fn generate_param_hash(content: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content);
    let hex = format!("{:x}", hasher.finalize());
    hex[..8].to_string()
}

/// Pure scanner for local media directories returning sorted entries matching valid extensions.
pub fn scan_media_directory(dir_path: &Path) -> Result<Vec<MediaFileEntry>, std::io::Error> {
    if !dir_path.exists() || !dir_path.is_dir() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(dir_path)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if is_valid_media_extension(ext) {
                    let metadata = entry.metadata()?;
                    let size_bytes = metadata.len();
                    let size_mb = (size_bytes as f64 / (1024.0 * 1024.0) * 100.0).round() / 100.0;
                    let name = path.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();
                    let full_path = path.to_string_lossy().to_string();

                    entries.push(MediaFileEntry {
                        name,
                        path: full_path,
                        size_bytes,
                        size_mb,
                        extension: format!(".{}", ext.to_ascii_lowercase()),
                    });
                }
            }
        }
    }

    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_valid_media_extension() {
        assert!(is_valid_media_extension("mkv"));
        assert!(is_valid_media_extension(".MKV"));
        assert!(is_valid_media_extension("mp4"));
        assert!(!is_valid_media_extension("txt"));
        assert!(!is_valid_media_extension("exe"));
    }

    #[test]
    fn test_seconds_to_timecode() {
        assert_eq!(seconds_to_timecode(0.0, true), "00:00:00.000");
        assert_eq!(seconds_to_timecode(0.0, false), "00:00:00");
        assert_eq!(seconds_to_timecode(3661.5, true), "01:01:01.500");
        assert_eq!(seconds_to_timecode(3661.5, false), "01:01:01");
    }

    #[test]
    fn test_get_part_path() {
        assert_eq!(
            get_part_path("C:/restored/tape01.mkv"),
            "C:/restored/tape01.mkv.part"
        );
    }

    #[test]
    fn test_generate_param_hash() {
        let hash1 = generate_param_hash(b"{\"crf\": 18, \"preset\": \"slow\"}");
        assert_eq!(hash1.len(), 8);
        let hash2 = generate_param_hash(b"{\"crf\": 18, \"preset\": \"slow\"}");
        assert_eq!(hash1, hash2);
        let hash3 = generate_param_hash(b"{\"crf\": 22, \"preset\": \"fast\"}");
        assert_ne!(hash1, hash3);
    }
}
