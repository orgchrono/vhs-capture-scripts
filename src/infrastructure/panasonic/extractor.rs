//! Subprocess executor for Panasonic MEIHDFS and DVD-VR stream extraction.
//!
//! Orchestrates external tools (`extract_meihdfs`, `dvd-vr`, or `ffmpeg`) to extract
//! recorded TV titles and audio-video streams from Panasonic raw dumps or drives.

use std::path::Path;
use crate::infrastructure::toolchain::{create_silent_command, resolve_executable_path};

/// Validates whether a path is a valid ingest source (raw device or existing filesystem path).
#[must_use]
pub fn is_valid_ingest_source(p: &Path) -> bool {
    let s = p.to_string_lossy();
    s.starts_with(r"\\.\") || s.starts_with("/dev/") || p.exists()
}

/// Executes extraction of Panasonic titles from a disk dump, partition, or disc image into an output folder.
pub fn execute_panasonic_extraction(
    source_path: &str,
    output_dir: &str,
    selected_title_ids: Option<&[u32]>,
) -> Result<Vec<String>, String> {
    let out_p = Path::new(output_dir);
    if let Err(e) = std::fs::create_dir_all(out_p) {
        return Err(format!("Failed to create destination directory: {e}"));
    }

    let src_p = Path::new(source_path);
    if !is_valid_ingest_source(src_p) {
        return Err(format!("Source path does not exist: {source_path}"));
    }

    let extractor = resolve_executable_path("extract_meihdfs", None, None)
        .or_else(|| resolve_executable_path("dvd-vr", None, None))
        .or_else(|| resolve_executable_path("ffmpeg", None, None));

    let bin_path = match extractor {
        Some(bin) => bin,
        None => return Err("No Panasonic extraction toolchain binary available.".to_string()),
    };

    let bin_name = bin_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let mut cmd = create_silent_command(&bin_path);

    if bin_name.contains("extract_meihdfs") {
        cmd.args([source_path, output_dir]);
    } else if bin_name.contains("dvd-vr") {
        cmd.args(["-n", "[ts]-[label]#[pgm]", source_path]);
        cmd.current_dir(out_p);
    } else {
        let target_file = out_p.join("panasonic_extracted.mpg");
        cmd.args([
            "-y",
            "-i",
            source_path,
            "-c",
            "copy",
            &target_file.to_string_lossy(),
        ]);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Extraction tool spawn error: {e}"))?;

    // Stage 2: If extract_meihdfs was run, inspect output directory for DVD_RTAV VR_MANGR.IFO and VR_MOVIE.VRO.
    // If dvd-vr tool is available, split the raw continuous .VRO into individual program titles.
    if bin_name.contains("extract_meihdfs") {
        if let Some(dvd_vr_bin) = resolve_executable_path("dvd-vr", None, None) {
            let possible_dirs = [out_p.join("DVD_RTAV"), out_p.to_path_buf()];
            for dir in &possible_dirs {
                let ifo_candidates = ["VR_MANGR.IFO", "vr_mangr.ifo"];
                let vro_candidates = ["VR_MOVIE.VRO", "vr_movie.vro"];

                let ifo = ifo_candidates.iter().map(|n| dir.join(n)).find(|p| p.exists());
                let vro = vro_candidates.iter().map(|n| dir.join(n)).find(|p| p.exists());

                if let (Some(ifo_path), Some(vro_path)) = (ifo, vro) {
                    let mut dvd_vr_cmd = create_silent_command(&dvd_vr_bin);
                    dvd_vr_cmd.args([
                        "-n",
                        "[ts]-[label]#[pgm]",
                        &ifo_path.to_string_lossy(),
                        &vro_path.to_string_lossy(),
                    ]);
                    dvd_vr_cmd.current_dir(out_p);
                    let _ = dvd_vr_cmd.output();
                    break;
                }
            }
        }
    }

    let mut extracted_files = Vec::new();
    let mut dirs_to_scan = vec![out_p.to_path_buf()];
    while let Some(dir) = dirs_to_scan.pop() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    dirs_to_scan.push(p);
                } else if p.is_file() {
                    if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                        let ext_l = ext.to_ascii_lowercase();
                        if matches!(ext_l.as_str(), "mpg" | "vro" | "vob" | "mp4" | "mkv" | "ts") {
                            extracted_files.push(p.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    if let Some(ids) = selected_title_ids {
        if !ids.is_empty() && extracted_files.len() > 1 {
            extracted_files.retain(|f| {
                ids.iter()
                    .any(|id| f.contains(&format!("{id:02}")) || f.contains(&format!("#{id}")))
            });
        }
    }

    if !output.status.success() && extracted_files.is_empty() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Extraction command failed: {err}"));
    }

    Ok(extracted_files)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_valid_ingest_source() {
        assert!(is_valid_ingest_source(Path::new(r"\\.\PhysicalDrive0")));
        assert!(is_valid_ingest_source(Path::new(r"\\.\D:")));
        assert!(is_valid_ingest_source(Path::new("/dev/sdb")));
        assert!(is_valid_ingest_source(Path::new("Cargo.toml")));
        assert!(!is_valid_ingest_source(Path::new("non_existent_file_xyz_123.bin")));
    }
}
