//! VHS Studio Pro - Restoration Checkpoint & Recovery State Manager (`executor/checkpoint.rs`).

use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use super::planner::PlannedRestoration;

static FRAME_EXTRACTION_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

/// Atomically renames a file with exponential backoff retry to prevent Windows sharing violations (OS error 32 / 5).
pub fn atomic_rename_with_backoff(from: &std::path::Path, to: &std::path::Path) -> Result<(), String> {
    let mut last_err = String::new();
    for attempt in 0..8 {
        if to.exists() {
            let _ = fs::remove_file(to);
        }
        match fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(e) => {
                last_err = format!("{e}");
                std::thread::sleep(std::time::Duration::from_millis(25 * (1 << attempt.min(5))));
            }
        }
    }
    Err(format!(
        "Failed to rename {} to {} after retries: {last_err}",
        from.display(),
        to.display()
    ))
}

pub fn write_checkpoint(planned: &PlannedRestoration, status: &str, kept_frames: u64, elapsed: f64) {
    let fps = if elapsed > 0.0 {
        kept_frames as f64 / elapsed
    } else {
        0.0
    };
    let chk = crate::domain::recovery::CheckpointData {
        status: status.to_string(),
        source: Some(planned.input_path.clone()),
        destination: Some(planned.final_output_path.clone()),
        total_frames: Some(kept_frames),
        kept_frames: Some(kept_frames),
        frozen_frames: Some(0),
        dropped_frames: Some(0),
        total_expected_frames: Some(planned.expected_frames),
        elapsed_seconds: Some(elapsed),
        fps: Some(fps),
        request_json: planned.request_json.clone(),
    };
    let clean_base = planned
        .final_output_path
        .strip_suffix(".part")
        .unwrap_or(&planned.final_output_path);
    let chk_path = format!("{clean_base}.checkpoint.json");
    let tmp_chk_path = format!("{clean_base}.checkpoint.json.tmp");
    if let Ok(json_str) = serde_json::to_string_pretty(&chk) {
        if fs::write(&tmp_chk_path, json_str).is_ok() {
            let _ = atomic_rename_with_backoff(std::path::Path::new(&tmp_chk_path), std::path::Path::new(&chk_path));
        }
    }
}

pub fn update_live_restoration_frame(input_path: &str, current_sec: f64) {
    if FRAME_EXTRACTION_IN_FLIGHT
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    let input_path = input_path.to_string();
    std::thread::spawn(move || {
        struct FlightGuard;
        impl Drop for FlightGuard {
            fn drop(&mut self) {
                FRAME_EXTRACTION_IN_FLIGHT.store(false, Ordering::SeqCst);
            }
        }
        let _guard = FlightGuard;

        let dirs = crate::viewmodels::api_support::media_dirs();
        let _ = fs::create_dir_all(&dirs.work);
        let live_frame_path = dirs.work.join("live_frame.jpg");
        let tmp_frame_path = dirs.work.join("live_frame.tmp.jpg");
        if let Some(ffmpeg) =
            crate::infrastructure::toolchain::resolve_executable_path("ffmpeg", None, None)
        {
            let sec_str = format!("{:.2}", current_sec.max(0.0));
            let status = crate::infrastructure::toolchain::create_silent_command(&ffmpeg)
                .args([
                    "-ss",
                    &sec_str,
                    "-i",
                    &input_path,
                    "-vf",
                    "bwdif=mode=0:parity=-1:deint=1",
                    "-frames:v",
                    "1",
                    "-q:v",
                    "3",
                    "-y",
                    &tmp_frame_path.to_string_lossy(),
                ])
                .status();
            if status.is_ok_and(|s| s.success()) && tmp_frame_path.is_file() {
                let _ = atomic_rename_with_backoff(&tmp_frame_path, &live_frame_path);
            } else {
                let _ = fs::remove_file(&tmp_frame_path);
            }
        }
    });
}

pub fn remove_checkpoint(planned: &PlannedRestoration) {
    let clean_base = planned
        .final_output_path
        .strip_suffix(".part")
        .unwrap_or(&planned.final_output_path);
    let chk_path = format!("{clean_base}.checkpoint.json");
    let _ = fs::remove_file(chk_path);
    let dirs = crate::viewmodels::api_support::media_dirs();
    let _ = fs::remove_file(dirs.work.join("live_frame.jpg"));
}
