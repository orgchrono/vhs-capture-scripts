//! VHS Studio Pro - Native Toolchain & Process Execution Engine (`toolchain.rs`).
//!
//! Provides deterministic executable discovery, portable bundle path resolution,
//! SHA-256 fixity manifest validation, and silent background process spawning
//! (with Windows `CREATE_NO_WINDOW` flags to eliminate console flashes).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use serde::{Deserialize, Serialize};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows creation flag to prevent flashing a console window in GUI desktop mode.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Status summary of all core external CLI binaries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct ToolchainReport {
    pub ffmpeg: Option<String>,
    pub ffprobe: Option<String>,
    pub obs: Option<String>,
    pub extract_meihdfs: Option<String>,
    pub dvd_vr: Option<String>,
    pub udf_dump: Option<String>,
    pub vspipe: Option<String>,
    pub realesrgan: Option<String>,
    pub codeformer: Option<String>,
}

/// JSON schema for binary fixity manifests (checksums.json).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryChecksumEntry {
    pub sha256: String,
    #[serde(default)]
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChecksumsManifest {
    #[serde(default)]
    pub binaries: HashMap<String, HashMap<String, BinaryChecksumEntry>>,
}

/// Helper that returns the OS binary extension (".exe" on Windows, empty string on Unix).
#[must_use]
pub fn get_executable_extension() -> &'static str {
    if cfg!(windows) {
        ".exe"
    } else {
        ""
    }
}

/// Appends platform executable extension if missing.
#[must_use]
pub fn format_binary_name(base_name: &str) -> String {
    let ext = get_executable_extension();
    if ext.is_empty() || base_name.ends_with(ext) {
        base_name.to_string()
    } else {
        format!("{base_name}{ext}")
    }
}

/// Pure candidate directory generator for a named tool.
#[must_use]
pub fn get_tool_search_candidates(
    tool_name: &str,
    project_root: Option<&Path>,
    user_home: Option<&Path>,
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let bin_name = format_binary_name(tool_name);

    if let Some(root) = project_root {
        candidates.push(root.join("tools").join(&bin_name));
        candidates.push(root.join("tools").join("bin").join(&bin_name));
        candidates.push(root.join("tools").join(tool_name).join(&bin_name));
        candidates.push(root.join("tools").join(tool_name).join("bin").join(&bin_name));
        candidates.push(root.join("tools").join("panasonic_rec").join(&bin_name));
        candidates.push(root.join("tools").join("panasonic_rec").join("bin").join(&bin_name));
        candidates.push(root.join("tools").join("ffmpeg").join("bin").join(&bin_name));
        candidates.push(root.join("tools").join("obs").join("bin").join("64bit").join(&bin_name));
    }

    if let Some(home) = user_home {
        candidates.push(home.join(".local").join("bin").join(&bin_name));
        candidates.push(home.join(".vhs_studio").join("tools").join(&bin_name));
    }

    if cfg!(target_os = "windows") {
        candidates.push(PathBuf::from(r"C:\Program Files\obs-studio\bin\64bit\obs64.exe"));
        candidates.push(PathBuf::from(r"C:\Program Files\VapourSynth\vspipe.exe"));
        candidates.push(PathBuf::from(r"C:\Program Files (x86)\VapourSynth\vspipe.exe"));
    } else if cfg!(target_os = "macos") {
        candidates.push(PathBuf::from("/Applications/OBS.app/Contents/MacOS/OBS"));
        candidates.push(PathBuf::from("/opt/homebrew/bin").join(&bin_name));
        candidates.push(PathBuf::from("/usr/local/bin").join(&bin_name));
    } else {
        candidates.push(PathBuf::from("/usr/bin").join(&bin_name));
        candidates.push(PathBuf::from("/usr/local/bin").join(&bin_name));
        candidates.push(PathBuf::from("/var/lib/flatpak/exports/bin/com.obsproject.Studio"));
        candidates.push(PathBuf::from("/snap/bin/obs-studio"));
    }

    candidates
}

/// Resolves an executable by checking custom search candidates, directory paths, and system PATH.
pub fn resolve_executable_path(
    tool_name: &str,
    project_root: Option<&Path>,
    user_home: Option<&Path>,
) -> Option<PathBuf> {
    let candidates = get_tool_search_candidates(tool_name, project_root, user_home);
    for cand in candidates {
        if cand.is_file() {
            return Some(cand);
        }
    }

    let bin_name = format_binary_name(tool_name);
    if let Ok(path_var) = std::env::var("PATH") {
        let separator = if cfg!(windows) { ';' } else { ':' };
        for dir in path_var.split(separator) {
            let p = Path::new(dir).join(&bin_name);
            if p.is_file() {
                return Some(p);
            }
        }
    }

    None
}

/// Validates binary SHA-256 against a parsed checksums manifest.
#[must_use]
pub fn verify_binary_integrity(
    binary_filename: &str,
    actual_sha256: &str,
    platform_key: &str,
    manifest_json: &str,
) -> (bool, String) {
    let manifest: ChecksumsManifest = match serde_json::from_str(manifest_json) {
        Ok(m) => m,
        Err(err) => return (false, format!("Failed to parse checksums manifest: {err}")),
    };

    let platform_bins = match manifest.binaries.get(platform_key) {
        Some(bins) => bins,
        None => {
            return (
                true,
                format!("Platform '{platform_key}' not indexed in manifest; integrity check skipped"),
            )
        }
    };

    let entry = match platform_bins.get(binary_filename) {
        Some(e) => e,
        None => {
            return (
                true,
                format!("Binary '{binary_filename}' is locally compiled or unindexed"),
            )
        }
    };

    let expected = entry.sha256.to_lowercase();
    let actual = actual_sha256.to_lowercase();

    if expected == actual {
        (true, format!("Verified SHA-256: {actual}"))
    } else {
        (
            false,
            format!("INTEGRITY MISMATCH for '{binary_filename}': expected {expected}, calculated {actual}"),
        )
    }
}

/// Spawns a background Command configured to never flash console windows on Windows GUI.
#[must_use]
pub fn create_silent_command(program: &Path) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Executes a subprocess synchronously with invisible console window and captures output.
pub fn run_command_silent(program: &Path, args: &[&str]) -> Result<Output, std::io::Error> {
    let mut cmd = create_silent_command(program);
    cmd.args(args);
    cmd.output()
}

/// Queries FFmpeg output to test if an encoder is supported.
#[must_use]
pub fn check_ffmpeg_encoder_in_output(output_text: &str, encoder_name: &str) -> bool {
    output_text.lines().any(|line| {
        let trimmed = line.trim();
        (trimmed.starts_with("V.....") || trimmed.starts_with("A.....") || trimmed.starts_with("S....."))
            && trimmed.contains(encoder_name)
    })
}

/// Queries FFmpeg output to test if a filter is supported.
#[must_use]
pub fn check_ffmpeg_filter_in_output(output_text: &str, filter_name: &str) -> bool {
    output_text.lines().any(|line| {
        let trimmed = line.trim();
        (trimmed.starts_with("T..") || trimmed.starts_with("..."))
            && trimmed.split_whitespace().any(|token| token == filter_name)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_binary_name() {
        let name = "ffmpeg";
        let formatted = format_binary_name(name);
        if cfg!(windows) {
            assert_eq!(formatted, "ffmpeg.exe");
        } else {
            assert_eq!(formatted, "ffmpeg");
        }
    }

    #[test]
    fn test_get_tool_search_candidates_includes_tools_dir() {
        let root = Path::new("/workspace");
        let candidates = get_tool_search_candidates("ffmpeg", Some(root), None);
        assert!(!candidates.is_empty());
        let expected_bin = format_binary_name("ffmpeg");
        assert!(candidates.iter().any(|p| p.ends_with(format!("tools/ffmpeg/bin/{expected_bin}"))
            || p.ends_with(format!("tools\\ffmpeg\\bin\\{expected_bin}"))));
    }

    #[test]
    fn test_verify_binary_integrity_matching() {
        let manifest = r#"{
            "binaries": {
                "windows-x64": {
                    "extract_meihdfs.exe": {
                        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
                    }
                }
            }
        }"#;

        let (ok, msg) = verify_binary_integrity(
            "extract_meihdfs.exe",
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "windows-x64",
            manifest,
        );
        assert!(ok);
        assert!(msg.contains("Verified SHA-256"));
    }

    #[test]
    fn test_verify_binary_integrity_mismatch() {
        let manifest = r#"{
            "binaries": {
                "windows-x64": {
                    "dvd-vr.exe": {
                        "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                    }
                }
            }
        }"#;

        let (ok, msg) = verify_binary_integrity(
            "dvd-vr.exe",
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "windows-x64",
            manifest,
        );
        assert!(!ok);
        assert!(msg.contains("INTEGRITY MISMATCH"));
    }

    #[test]
    fn test_check_ffmpeg_encoder_in_output() {
        let sample = "Encoders:\n V..... libx264              libx264 H.264 / AVC\n V..... h264_nvenc           NVIDIA NVENC H.264 encoder\n";
        assert!(check_ffmpeg_encoder_in_output(sample, "libx264"));
        assert!(check_ffmpeg_encoder_in_output(sample, "h264_nvenc"));
        assert!(!check_ffmpeg_encoder_in_output(sample, "hevc_amf"));
    }

    #[test]
    fn test_check_ffmpeg_filter_in_output() {
        let sample = "Filters:\n T.. bwdif             V->V       Deinterlace using BWDIF algorithm\n ... hqdn3d            V->V       Apply a High Quality 3D Denoise filter\n";
        assert!(check_ffmpeg_filter_in_output(sample, "bwdif"));
        assert!(check_ffmpeg_filter_in_output(sample, "hqdn3d"));
        assert!(!check_ffmpeg_filter_in_output(sample, "non_existent_filter"));
    }
}
