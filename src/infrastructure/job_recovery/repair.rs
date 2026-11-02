//! FFmpeg-based container repair and atomic file cleanup for incomplete restoration jobs.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::infrastructure::toolchain::create_silent_command;
use super::scanner::{resolve_physical_target_file, MIN_VIABLE_PART_SIZE_BYTES};

/// Finalizes a partial video container using stream-copy muxing (`-c copy`) so it becomes playable.
pub fn finalize_partial_video(output_path: &Path, ffmpeg_bin: &Path) -> Result<PathBuf, String> {
    let real_input = match resolve_physical_target_file(output_path) {
        Some(p) if p.metadata().map(|m| m.len()).unwrap_or(0) >= MIN_VIABLE_PART_SIZE_BYTES => p,
        _ => {
            return Err(format!(
                "Cannot finalize missing or empty partial video container: '{}'",
                output_path.display()
            ))
        }
    };

    // If a completed master file for THIS tape already exists in the same folder, use it and remove stale .part
    if let Some(parent) = real_input.parent() {
        let raw_name = real_input
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();
        let clean_name = raw_name.strip_suffix(".part").unwrap_or(raw_name);
        let raw_stem = if let Some((prefix, _)) = clean_name.split_once("_restored") {
            prefix
        } else if let Some((prefix, _)) = clean_name.rsplit_once('.') {
            prefix
        } else {
            clean_name
        };

        if !raw_stem.is_empty() {
            if let Ok(entries) = fs::read_dir(parent) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() {
                        let ename = p.file_name().and_then(|n| n.to_str()).unwrap_or_default();
                        if !ename.ends_with(".part")
                            && !ename.ends_with(".json")
                            && !ename.ends_with(".log")
                            && !ename.ends_with(".vtt")
                            && !ename.ends_with(".md")
                            && ename.starts_with(raw_stem)
                            && ename.contains("_restored")
                            && !ename.contains("_finalized")
                            && p.metadata().map(|m| m.len()).unwrap_or(0) >= MIN_VIABLE_PART_SIZE_BYTES
                        {
                            let _ = fs::remove_file(&real_input);
                            return Ok(p);
                        }
                    }
                }
            }
        }
    }

    let base_clean_str = real_input
        .to_string_lossy()
        .strip_suffix(".part")
        .unwrap_or(&real_input.to_string_lossy())
        .to_string();

    let base_clean = PathBuf::from(&base_clean_str);
    let stem = base_clean
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("finalized");
    let ext = base_clean
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4");

    let finalized_name = format!("{stem}_finalized.{ext}");
    let finalized_path = base_clean
        .parent()
        .map(|p| p.join(&finalized_name))
        .unwrap_or_else(|| PathBuf::from(&finalized_name));

    let mut cmd = create_silent_command(ffmpeg_bin);
    cmd.args([
        "-y",
        "-err_detect",
        "ignore_err",
        "-i",
        &real_input.to_string_lossy(),
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        &finalized_path.to_string_lossy(),
    ]);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to spawn ffmpeg: {e}"))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg remux finalization failed: {err}"));
    }

    if !finalized_path.is_file()
        || finalized_path.metadata().map(|m| m.len()).unwrap_or(0) < MIN_VIABLE_PART_SIZE_BYTES
    {
        return Err("Finalized output file was not created or is empty.".to_string());
    }

    // Synchronize defect and QC reports if they exist
    let parent = base_clean.parent();
    if let Some(par) = parent {
        let qc_src = par.join(format!("{stem}_qc_report.json"));
        let qc_dst = par.join(format!("{stem}_finalized_qc_report.json"));
        if qc_src.is_file() {
            let _ = fs::copy(&qc_src, &qc_dst);
        }

        let md_src = par.join(format!("{stem}_defect_report.md"));
        let md_dst = par.join(format!("{stem}_finalized_defect_report.md"));
        if md_src.is_file() {
            let _ = fs::copy(&md_src, &md_dst);
        }
    }

    Ok(finalized_path)
}

/// Safely removes partial artifacts, checkpoints, reports, and logs associated with an interrupted job.
pub fn discard_incomplete_job(output_path: &Path) -> Result<usize, String> {
    let mut files_to_remove = Vec::new();

    let out_str = output_path.to_string_lossy().to_string();
    let clean_str = out_str.strip_suffix(".part").unwrap_or(&out_str).to_string();

    files_to_remove.push(PathBuf::from(&clean_str));
    files_to_remove.push(PathBuf::from(format!("{clean_str}.part")));
    files_to_remove.push(PathBuf::from(format!("{clean_str}.checkpoint.json")));
    files_to_remove.push(PathBuf::from(format!("{clean_str}_qc_report.json")));
    files_to_remove.push(PathBuf::from(format!("{clean_str}_defect_report.md")));
    files_to_remove.push(PathBuf::from(format!("{clean_str}.tmp")));
    files_to_remove.push(PathBuf::from(format!("{clean_str}.log")));

    if let Some(parent) = Path::new(&clean_str).parent() {
        if parent.is_dir() {
            let base_stem = Path::new(&clean_str)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default();
            let clean_prefix = if let Some((prefix, _)) = base_stem.split_once("_restored") {
                prefix
            } else {
                base_stem
            };

            if let Ok(entries) = fs::read_dir(parent) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() {
                        let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or_default();
                        if fname.starts_with(clean_prefix)
                            && (fname.ends_with(".part")
                                || fname.ends_with(".tmp")
                                || fname.ends_with(".log"))
                        {
                            files_to_remove.push(p);
                        }
                    }
                }
            }
        }
    }

    let mut removed_count = 0;
    let mut seen = HashSet::new();

    for f in files_to_remove {
        let norm = f.to_string_lossy().to_ascii_lowercase();
        if seen.contains(&norm) {
            continue;
        }
        seen.insert(norm);

        if f.is_file() {
            if let Err(e) = fs::remove_file(&f) {
                return Err(format!("Failed to delete '{}': {e}", f.display()));
            }
            removed_count += 1;
        }
    }

    Ok(removed_count)
}
