//! Filesystem scanning for interrupted `.checkpoint.json` and orphan `.part` containers.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::domain::recovery::{assess_checkpoint, extract_raw_stem_from_restored_name, is_restored_filename, CheckpointData};
use crate::models::media::is_valid_media_extension;
use crate::models::recovery::IncompleteJob;
use crate::models::timestamp::{now_iso8601, unix_to_iso8601};

pub const MIN_VIABLE_PART_SIZE_BYTES: u64 = 1024;

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

                let clean_name = fname
                    .strip_suffix(".resumption.part")
                    .or_else(|| fname.strip_suffix(".part"))
                    .unwrap_or(fname);
                let raw_stem = extract_raw_stem_from_restored_name(clean_name);

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
                                && is_restored_filename(ename)
                                && extract_raw_stem_from_restored_name(ename) == raw_stem
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
                                            .unwrap_or_default()
                                            .to_ascii_lowercase();
                                        if cand_stem == raw_stem {
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
