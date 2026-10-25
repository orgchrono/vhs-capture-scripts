//! Infrastructure Layer: Restoration Job Recovery, Container Repair & Incomplete Job Scanner (`infrastructure::job_recovery`).
//!
//! Provides filesystem scanning for interrupted `.checkpoint.json` and orphan `.part` containers,
//! safe container stream repair via FFmpeg, atomic cleanup of scratch files, and state inspection.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::domain::recovery::{assess_checkpoint, CheckpointData};
use crate::infrastructure::toolchain::create_silent_command;
use crate::models::media::is_valid_media_extension;
use crate::models::recovery::{ExistingRestorationCheck, IncompleteJob};
use crate::models::timestamp::{now_iso8601, unix_to_iso8601};

const MIN_VIABLE_PART_SIZE_BYTES: u64 = 1024;

/// Resolves the actual physical file on disk (handling `.part` extensions or prefix matches).
#[must_use]
pub fn resolve_physical_target_file(path: &Path) -> Option<PathBuf> {
    if path.as_os_str().is_empty() {
        return None;
    }

    if path.is_file() && path.metadata().map(|m| m.len()).unwrap_or(0) > 0 {
        return Some(path.to_path_buf());
    }

    let part_candidate = PathBuf::from(format!("{}.part", path.to_string_lossy()));
    if part_candidate.is_file() && part_candidate.metadata().map(|m| m.len()).unwrap_or(0) > 0 {
        return Some(part_candidate);
    }

    if let Some(parent) = path.parent() {
        if parent.is_dir() {
            let base_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default();
            let base_stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(base_name);
            let clean_stem = base_stem;

            if let Ok(entries) = fs::read_dir(parent) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() {
                        let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or_default();
                        if fname.starts_with(clean_stem)
                            && fname.ends_with(".part")
                            && p.metadata().map(|m| m.len()).unwrap_or(0) > 0
                        {
                            return Some(p);
                        }
                    }
                }
            }
        }
    }

    None
}

/// Recursively scans search directories for `.checkpoint.json` and orphan `.part` containers.
pub fn scan_incomplete_jobs(search_dirs: &[PathBuf], raw_dirs: &[PathBuf]) -> Vec<IncompleteJob> {
    let mut incomplete_jobs = Vec::new();
    let mut seen_checkpoints = HashSet::new();
    let mut seen_output_files = HashSet::new();

    // Pass 1: Scan for .checkpoint.json files
    for sdir in search_dirs {
        if !sdir.exists() || !sdir.is_dir() {
            continue;
        }

        let mut dirs_to_visit = vec![sdir.clone()];
        while let Some(current_dir) = dirs_to_visit.pop() {
            let entries = match fs::read_dir(&current_dir) {
                Ok(e) => e,
                Err(_) => continue,
            };

            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    dirs_to_visit.push(path);
                    continue;
                }

                let fname = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or_default();
                if !fname.ends_with(".checkpoint.json") {
                    continue;
                }

                let norm_chk = path.to_string_lossy().to_ascii_lowercase();
                if seen_checkpoints.contains(&norm_chk) {
                    continue;
                }
                seen_checkpoints.insert(norm_chk);

                let content = match fs::read_to_string(&path) {
                    Ok(c) => c,
                    Err(_) => continue,
                };

                let data: CheckpointData = match serde_json::from_str(&content) {
                    Ok(d) => d,
                    Err(_) => continue,
                };

                if data.status.eq_ignore_ascii_case("completed") {
                    continue;
                }

                let source = data.source.clone().unwrap_or_default();
                let dest = data.destination.clone().unwrap_or_else(|| {
                    let p_str = path.to_string_lossy();
                    p_str
                        .strip_suffix(".checkpoint.json")
                        .unwrap_or(&p_str)
                        .to_string()
                });

                let real_dest = resolve_physical_target_file(Path::new(&dest))
                    .unwrap_or_else(|| PathBuf::from(&dest));
                let dest_size = real_dest.metadata().map(|m| m.len()).unwrap_or(0);
                let source_exists = !source.is_empty() && Path::new(&source).exists();

                seen_output_files.insert(real_dest.to_string_lossy().to_ascii_lowercase());
                seen_output_files.insert(dest.to_ascii_lowercase());
                seen_output_files.insert(format!("{dest}.part").to_ascii_lowercase());

                let job_id = Path::new(&dest)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("job")
                    .to_string();

                let assessment = assess_checkpoint(job_id.clone(), &data, source_exists);

                let mut progress_pct = assessment.progress_percent;
                if progress_pct == 0.0 && dest_size > 0 && source_exists {
                    if let Ok(src_meta) = fs::metadata(&source) {
                        let src_size = src_meta.len();
                        if src_size > 0 {
                            progress_pct =
                                ((dest_size as f64 / src_size as f64) * 50.0).clamp(0.0, 90.0);
                        }
                    }
                }

                let last_modified = path
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| unix_to_iso8601(d.as_secs()))
                    .unwrap_or_else(now_iso8601);

                incomplete_jobs.push(IncompleteJob {
                    job_id,
                    source_file: source,
                    output_file: dest,
                    checkpoint_file: path.to_string_lossy().to_string(),
                    status: format!("{:?}", assessment.status).to_ascii_lowercase(),
                    processed_frames: assessment.processed_frames,
                    total_expected_frames: assessment.total_expected_frames,
                    progress_percent: progress_pct,
                    elapsed_seconds: assessment.elapsed_seconds,
                    fps: assessment.fps,
                    output_size_bytes: dest_size,
                    last_modified,
                    can_resume: assessment.can_resume,
                    source_exists,
                });
            }
        }
    }

    // Pass 2: Scan for orphaned .part containers lacking checkpoints
    for sdir in search_dirs {
        if !sdir.exists() || !sdir.is_dir() {
            continue;
        }

        let mut dirs_to_visit = vec![sdir.clone()];
        while let Some(current_dir) = dirs_to_visit.pop() {
            let entries = match fs::read_dir(&current_dir) {
                Ok(e) => e,
                Err(_) => continue,
            };

            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    dirs_to_visit.push(path);
                    continue;
                }

                let fname = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or_default();
                if !fname.ends_with(".part") {
                    continue;
                }

                let norm_part = path.to_string_lossy().to_ascii_lowercase();
                if seen_output_files.contains(&norm_part) {
                    continue;
                }
                seen_output_files.insert(norm_part.clone());

                let dest_size = path.metadata().map(|m| m.len()).unwrap_or(0);
                if dest_size < MIN_VIABLE_PART_SIZE_BYTES {
                    continue;
                }

                let clean_name = fname.strip_suffix(".part").unwrap_or(fname);
                let raw_stem = if let Some((prefix, _)) = clean_name.split_once("_restored") {
                    prefix
                } else {
                    clean_name
                };

                // If a fully restored master already exists on disk for this tape, skip orphaned .part
                let has_completed_master = if let Ok(dir_entries) = fs::read_dir(&current_dir) {
                    dir_entries.flatten().any(|e| {
                        let ep = e.path();
                        if ep.is_file() {
                            let ename = ep.file_name().and_then(|n| n.to_str()).unwrap_or_default();
                            !ename.ends_with(".part")
                                && !ename.ends_with(".json")
                                && !ename.ends_with(".log")
                                && !ename.ends_with(".vtt")
                                && !ename.ends_with(".md")
                                && ename.contains(raw_stem)
                                && ename.contains("_restored")
                                && ep.metadata().map(|m| m.len()).unwrap_or(0) >= MIN_VIABLE_PART_SIZE_BYTES
                        } else {
                            false
                        }
                    })
                } else {
                    false
                };

                if has_completed_master {
                    continue;
                }

                let mut source_file = String::new();
                let mut source_exists = false;

                for rdir in raw_dirs {
                    if !rdir.is_dir() {
                        continue;
                    }
                    if let Ok(cands) = fs::read_dir(rdir) {
                        for cand in cands.flatten() {
                            let cand_path = cand.path();
                            if cand_path.is_file() {
                                if let Some(ext) = cand_path.extension().and_then(|e| e.to_str()) {
                                    if is_valid_media_extension(ext) {
                                        let cand_stem = cand_path
                                            .file_stem()
                                            .and_then(|s| s.to_str())
                                            .unwrap_or_default();
                                        if cand_stem == raw_stem
                                            || raw_stem.starts_with(cand_stem)
                                        {
                                            source_file = cand_path.to_string_lossy().to_string();
                                            source_exists = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if source_exists {
                        break;
                    }
                }

                let mut progress_pct = 0.0;
                if source_exists {
                    if let Ok(src_meta) = fs::metadata(&source_file) {
                        let src_size = src_meta.len();
                        if src_size > 0 {
                            progress_pct =
                                ((dest_size as f64 / src_size as f64) * 50.0).clamp(0.0, 85.0);
                        }
                    }
                }

                let last_modified = path
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| unix_to_iso8601(d.as_secs()))
                    .unwrap_or_else(now_iso8601);

                let output_file = path
                    .parent()
                    .map(|p| p.join(clean_name))
                    .unwrap_or_else(|| PathBuf::from(clean_name))
                    .to_string_lossy()
                    .to_string();

                let job_id = Path::new(clean_name)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("orphan")
                    .to_string();

                incomplete_jobs.push(IncompleteJob {
                    job_id,
                    source_file,
                    output_file,
                    checkpoint_file: String::new(),
                    status: "incomplete".to_string(),
                    processed_frames: 0,
                    total_expected_frames: 0,
                    progress_percent: (progress_pct * 10.0).round() / 10.0,
                    elapsed_seconds: 0.0,
                    fps: 29.97,
                    output_size_bytes: dest_size,
                    last_modified,
                    can_resume: source_exists,
                    source_exists,
                });
            }
        }
    }

    incomplete_jobs.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    incomplete_jobs
}

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

/// Checks whether an existing partial job or completed restoration exists for a given source tape.
pub fn check_existing_restoration(
    source_path: &Path,
    search_dirs: &[PathBuf],
    raw_dirs: &[PathBuf],
    restored_dir: &Path,
) -> ExistingRestorationCheck {
    if source_path.as_os_str().is_empty() {
        return ExistingRestorationCheck::default();
    }

    let source_str = source_path.to_string_lossy().to_ascii_lowercase();
    let source_stem = source_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    // 1. Check active incomplete jobs
    let incomplete = scan_incomplete_jobs(search_dirs, raw_dirs);
    for job in incomplete {
        let job_source = job.source_file.to_ascii_lowercase();
        let job_id = job.job_id.to_ascii_lowercase();
        if job_source == source_str
            || (!source_stem.is_empty() && (job_source.contains(&source_stem) || job_id.contains(&source_stem)))
        {
            return ExistingRestorationCheck {
                has_existing: true,
                r#type: Some("partial".to_string()),
                file_path: Some(job.output_file),
                size_bytes: Some(job.output_size_bytes),
                can_resume: Some(job.can_resume),
                progress_percent: Some(job.progress_percent),
                last_modified: Some(job.last_modified),
            };
        }
    }

    // 2. Check completed video in restored_dir
    if restored_dir.is_dir() {
        let mut dirs_to_visit = vec![restored_dir.to_path_buf()];
        while let Some(current) = dirs_to_visit.pop() {
            let entries = match fs::read_dir(&current) {
                Ok(e) => e,
                Err(_) => continue,
            };

            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    dirs_to_visit.push(p);
                    continue;
                }

                let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or_default();
                let fname_lower = fname.to_ascii_lowercase();
                if fname_lower.ends_with(".part") {
                    continue;
                }

                if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                    if is_valid_media_extension(ext)
                        && !source_stem.is_empty()
                        && fname_lower.contains(&source_stem)
                    {
                        let size = p.metadata().map(|m| m.len()).unwrap_or(0);
                        if size > MIN_VIABLE_PART_SIZE_BYTES {
                            let last_mod = p
                                .metadata()
                                .ok()
                                .and_then(|m| m.modified().ok())
                                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                                .map(|d| unix_to_iso8601(d.as_secs()))
                                .unwrap_or_else(now_iso8601);

                            return ExistingRestorationCheck {
                                has_existing: true,
                                r#type: Some("completed".to_string()),
                                file_path: Some(p.to_string_lossy().to_string()),
                                size_bytes: Some(size),
                                can_resume: Some(false),
                                progress_percent: Some(100.0),
                                last_modified: Some(last_mod),
                            };
                        }
                    }
                }
            }
        }
    }

    ExistingRestorationCheck::default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_physical_target_file_finds_part() {
        let temp_dir = std::env::temp_dir().join(format!("vhs_recovery_test_part_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);

        let final_path = temp_dir.join("tape01_restored.mp4");
        let part_path = temp_dir.join("tape01_restored.mp4.part");
        let _ = fs::write(&part_path, vec![0u8; 2048]);

        let resolved = resolve_physical_target_file(&final_path);
        assert_eq!(resolved, Some(part_path.clone()));

        let _ = fs::remove_file(part_path);
        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_scan_and_discard_incomplete_jobs() {
        let temp_dir = std::env::temp_dir().join(format!("vhs_recovery_test_scan_{}", std::process::id()));
        let restored_dir = temp_dir.join("restored");
        let raw_dir = temp_dir.join("raw");
        let _ = fs::create_dir_all(&restored_dir);
        let _ = fs::create_dir_all(&raw_dir);

        let raw_tape = raw_dir.join("home_movie.mkv");
        let _ = fs::write(&raw_tape, vec![0u8; 4096]);

        let output_video = restored_dir.join("home_movie_restored.mp4");
        let part_video = restored_dir.join("home_movie_restored.mp4.part");
        let _ = fs::write(&part_video, vec![0u8; 2048]);

        let chk_path = restored_dir.join("home_movie_restored.mp4.checkpoint.json");
        let chk_json = serde_json::json!({
            "status": "in_progress",
            "source": raw_tape.to_string_lossy(),
            "destination": output_video.to_string_lossy(),
            "total_frames": 1000,
            "kept_frames": 900,
            "frozen_frames": 100,
            "total_expected_frames": 2000,
            "elapsed_seconds": 35.0,
            "fps": 30.0
        });
        let _ = fs::write(&chk_path, serde_json::to_string(&chk_json).unwrap());

        // Scan
        let jobs = scan_incomplete_jobs(std::slice::from_ref(&restored_dir), std::slice::from_ref(&raw_dir));
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].job_id, "home_movie_restored");
        assert_eq!(jobs[0].processed_frames, 1000);
        assert_eq!(jobs[0].progress_percent, 50.0);
        assert!(jobs[0].can_resume);

        // Check existing
        let check = check_existing_restoration(&raw_tape, std::slice::from_ref(&restored_dir), std::slice::from_ref(&raw_dir), &restored_dir);
        assert!(check.has_existing);
        assert_eq!(check.r#type, Some("partial".to_string()));

        // Discard
        let discarded = discard_incomplete_job(&output_video).expect("discard success");
        assert!(discarded >= 2); // part + checkpoint
        assert!(!part_video.exists());
        assert!(!chk_path.exists());

        let _ = fs::remove_dir_all(temp_dir);
    }
}
