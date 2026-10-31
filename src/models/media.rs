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
/// Recursively scans immediate subdirectories (up to 2 levels) to discover nested exports.
pub fn scan_media_directory(dir_path: &Path) -> Result<Vec<MediaFileEntry>, std::io::Error> {
    if !dir_path.exists() || !dir_path.is_dir() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    let mut dirs_to_visit = vec![(dir_path.to_path_buf(), 0usize)];

    while let Some((current_dir, depth)) = dirs_to_visit.pop() {
        let read_res = match fs::read_dir(&current_dir) {
            Ok(r) => r,
            Err(_) => continue,
        };

        for entry in read_res.flatten() {
            let path = entry.path();
            if path.is_dir() && depth < 2 {
                dirs_to_visit.push((path, depth + 1));
                continue;
            }
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if is_valid_media_extension(ext) {
                        let metadata = match entry.metadata() {
                            Ok(m) => m,
                            Err(_) => continue,
                        };
                        let size_bytes = metadata.len();
                        let size_mb = (size_bytes as f64 / (1024.0 * 1024.0) * 100.0).round() / 100.0;
                        let name = path
                            .file_name()
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
    }

    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

/// Check if a video file is completely written and ready for ingest processing.
#[must_use]
pub fn is_file_ready_for_ingest(path: &Path, min_size_bytes: u64) -> bool {
    if !path.is_file() {
        return false;
    }

    let ext = match path.extension().and_then(|e| e.to_str()) {
        Some(e) => e,
        None => return false,
    };

    if !is_valid_media_extension(ext) {
        return false;
    }

    let file_str = path.to_string_lossy().to_ascii_lowercase();
    if file_str.ends_with(".part") || file_str.ends_with(".tmp") {
        return false;
    }

    match fs::metadata(path) {
        Ok(meta) => {
            if meta.len() < min_size_bytes {
                return false;
            }
        }
        Err(_) => return false,
    }

    // Attempt to open read-only to verify no exclusive write lock is blocking access
    fs::File::open(path).is_ok()
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

    #[test]
    fn test_is_file_ready_for_ingest() {
        let temp_dir = std::env::temp_dir();
        let valid_file = temp_dir.join(format!("vhs_test_ready_{}.mp4", std::process::id()));
        let part_file = temp_dir.join(format!("vhs_test_ready_{}.mp4.part", std::process::id()));
        let txt_file = temp_dir.join(format!("vhs_test_ready_{}.txt", std::process::id()));

        // Create 2KB valid file
        std::fs::write(&valid_file, vec![0u8; 2048]).expect("Write failed");
        std::fs::write(&part_file, vec![0u8; 2048]).expect("Write failed");
        std::fs::write(&txt_file, vec![0u8; 2048]).expect("Write failed");

        assert!(is_file_ready_for_ingest(&valid_file, 1024));
        // Reject .part files
        assert!(!is_file_ready_for_ingest(&part_file, 1024));
        // Reject non-media files
        assert!(!is_file_ready_for_ingest(&txt_file, 1024));
        // Reject undersized files
        assert!(!is_file_ready_for_ingest(&valid_file, 4096));

        let _ = std::fs::remove_file(valid_file);
        let _ = std::fs::remove_file(part_file);
        let _ = std::fs::remove_file(txt_file);
    }

    #[test]
    fn test_scan_media_directory_discovers_nested_files() {
        let temp_dir = std::env::temp_dir().join(format!("vhs_test_scan_{}", std::process::id()));
        let sub_dir = temp_dir.join("subfolder");
        let _ = std::fs::create_dir_all(&sub_dir);

        let top_file = temp_dir.join("master_tape_01.mp4");
        let nested_file = sub_dir.join("master_tape_02.mkv");
        let part_file = sub_dir.join("in_progress.mp4.part");
        let txt_file = sub_dir.join("notes.txt");

        let _ = std::fs::write(&top_file, vec![0u8; 1024]);
        let _ = std::fs::write(&nested_file, vec![0u8; 2048]);
        let _ = std::fs::write(&part_file, vec![0u8; 1024]);
        let _ = std::fs::write(&txt_file, b"info");

        let scanned = scan_media_directory(&temp_dir).expect("Scan should succeed");
        assert_eq!(scanned.len(), 2);
        assert!(scanned.iter().any(|e| e.name == "master_tape_01.mp4"));
        assert!(scanned.iter().any(|e| e.name == "master_tape_02.mkv"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
