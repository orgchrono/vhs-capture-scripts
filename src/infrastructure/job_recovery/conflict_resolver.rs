//! Conflict resolution and state inspection between raw captures and restored masters.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::domain::recovery::{extract_raw_stem_from_restored_name, is_restored_filename};
use crate::models::media::is_valid_media_extension;
use crate::models::recovery::ExistingRestorationCheck;
use crate::models::timestamp::{now_iso8601, unix_to_iso8601};
use super::scanner::{scan_incomplete_jobs, MIN_VIABLE_PART_SIZE_BYTES};

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
        let job_raw_stem = extract_raw_stem_from_restored_name(&job.job_id);
        if job_source == source_str
            || (!source_stem.is_empty() && job_raw_stem == source_stem)
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
                        && extract_raw_stem_from_restored_name(&fname_lower) == source_stem
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

/// Resolves a bidirectional `(raw_source_path, restored_master_path, input_is_restored_master)` tuple
/// regardless of whether the user selected a Raw tape (`dirs.raw`) or a Restored Master (`dirs.restored`).
#[must_use]
pub fn resolve_raw_and_restored_pair(
    input_path: &Path,
    search_dirs: &[PathBuf],
    raw_dirs: &[PathBuf],
    restored_dir: &Path,
) -> (PathBuf, Option<PathBuf>, bool) {
    let fname = input_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();
    let norm_input = input_path.to_string_lossy().replace('\\', "/").to_ascii_lowercase();
    let norm_restored = restored_dir.to_string_lossy().replace('\\', "/").to_ascii_lowercase();

    let in_restored_dir = !norm_restored.is_empty() && norm_input.starts_with(&norm_restored);
    let looks_like_master = in_restored_dir || is_restored_filename(fname);

    if looks_like_master {
        let raw_stem = extract_raw_stem_from_restored_name(fname);
        if !raw_stem.is_empty() {
            for rdir in raw_dirs {
                if !rdir.is_dir() {
                    continue;
                }
                if let Ok(entries) = fs::read_dir(rdir) {
                    for entry in entries.flatten() {
                        let cand = entry.path();
                        if cand.is_file() {
                            if let Some(ext) = cand.extension().and_then(|e| e.to_str()) {
                                if is_valid_media_extension(ext) {
                                    let cand_stem = cand
                                        .file_stem()
                                        .and_then(|s| s.to_str())
                                        .unwrap_or_default()
                                        .to_ascii_lowercase();
                                    if cand_stem == raw_stem {
                                        return (
                                            cand,
                                            Some(input_path.to_path_buf()),
                                            true,
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        return (input_path.to_path_buf(), Some(input_path.to_path_buf()), true);
    }

    let check = check_existing_restoration(input_path, search_dirs, raw_dirs, restored_dir);
    let master_opt = if check.has_existing && check.r#type.as_deref() == Some("completed") {
        check.file_path.map(PathBuf::from)
    } else {
        None
    };

    (input_path.to_path_buf(), master_opt, false)
}
