//! VHS Studio Pro - Restoration Checkpoint & Recovery State Manager (`executor/checkpoint.rs`).

use std::fs;
use super::planner::PlannedRestoration;

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
    if let Ok(json_str) = serde_json::to_string_pretty(&chk) {
        let _ = fs::write(chk_path, json_str);
    }
}

pub fn update_live_restoration_frame(input_path: &str, current_sec: f64) {
    let input_path = input_path.to_string();
    std::thread::spawn(move || {
        let dirs = crate::viewmodels::api_support::media_dirs();
        let live_frame_path = dirs.work.join("live_frame.jpg");
        if let Some(ffmpeg) =
            crate::infrastructure::toolchain::resolve_executable_path("ffmpeg", None, None)
        {
            let sec_str = format!("{:.2}", current_sec.max(0.0));
            let _ = crate::infrastructure::toolchain::create_silent_command(&ffmpeg)
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
                    &live_frame_path.to_string_lossy(),
                ])
                .status();
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
