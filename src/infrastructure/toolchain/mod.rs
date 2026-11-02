//! VHS Studio Pro - Native Toolchain & Process Execution Engine (`toolchain`).
//!
//! Provides deterministic executable discovery, portable bundle path resolution,
//! SHA-256 fixity manifest validation, and silent background process spawning
//! (with Windows `CREATE_NO_WINDOW` flags to eliminate console flashes).

pub mod integrity;
pub mod probes;
pub mod process;
pub mod resolver;
pub mod types;

pub use integrity::verify_binary_integrity;
pub use probes::{
    check_ffmpeg_encoder_in_output, check_ffmpeg_filter_in_output, detect_best_ffmpeg_encoder,
    invalidate_qtgmc_cache, is_obs_installed, is_obs_running, is_qtgmc_viable,
    is_vapoursynth_available, test_ffmpeg_encoder,
};
pub use process::{create_compute_command, create_silent_command, run_command_silent};
pub use resolver::{
    format_binary_name, get_executable_extension, get_tool_search_candidates,
    is_executable_available, is_ffmpeg_available, resolve_executable_path, resolve_tool_command,
    resolve_tool_in_environment,
};
pub use types::{
    BinaryChecksumEntry, ChecksumsManifest, ToolchainReport, BELOW_NORMAL_PRIORITY_CLASS,
    CREATE_NO_WINDOW,
};

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

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
