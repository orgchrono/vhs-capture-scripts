//! Tauri IPC Command Handlers: Ingest, Media Probing, Disk Imaging, Frame Metrics, and QC.

use serde_json::Value;
use crate::domain::disk_imager::{DiskDevice, ForensicDumpReport, ImagingConfig};
use crate::domain::qc::FileQcAssessment;
use crate::domain::tbc::FrameSignalMetrics;
use crate::infrastructure::obs::{CaptureTriggerDecision, RgbPixel, VisualFrameAnalysis};
use crate::infrastructure::panasonic::{PanasonicChapter, PanasonicDiskInfo};
use crate::infrastructure::preflight::PreflightDiagnostics;
use crate::infrastructure::probe::MediaProbeResult;
use crate::infrastructure::thumbnail::FrameCandidateScore;

#[tauri::command]
pub async fn ipc_probe_media_file(
    file_path: String,
    ffprobe_binary: String,
) -> Result<MediaProbeResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::viewmodels::ingest_vm::ipc_probe_media_file(&file_path, &ffprobe_binary)
    })
    .await
    .map_err(|e| format!("Worker join error: {e}"))?
}

#[tauri::command]
pub fn ipc_parse_ffprobe_json(
    json_content: String,
    file_path: String,
) -> Result<MediaProbeResult, String> {
    crate::viewmodels::ingest_vm::ipc_parse_ffprobe_json(&json_content, &file_path)
}

#[tauri::command]
pub fn ipc_build_ffprobe_args(file_path: String) -> Vec<String> {
    crate::viewmodels::ingest_vm::ipc_build_ffprobe_args(&file_path)
}

#[tauri::command]
pub async fn ipc_detect_connected_drives() -> Vec<PanasonicDiskInfo> {
    tauri::async_runtime::spawn_blocking(|| {
        crate::viewmodels::ingest_vm::ipc_detect_connected_drives()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub async fn ipc_list_physical_drives() -> Vec<DiskDevice> {
    tauri::async_runtime::spawn_blocking(|| {
        crate::viewmodels::ingest_vm::ipc_list_physical_drives()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub async fn ipc_start_disk_imaging(
    window: tauri::Window,
    config: ImagingConfig,
) -> Result<ForensicDumpReport, String> {
    let ctx = crate::viewmodels::api_router::default_app_context().clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::viewmodels::ingest_vm::ipc_start_disk_imaging(&ctx, config, Some(window))
    })
    .await
    .map_err(|e| format!("Disk imaging worker join error: {e}"))?
}

#[tauri::command]
pub fn ipc_cancel_disk_imaging() -> Result<bool, String> {
    let ctx = crate::viewmodels::api_router::default_app_context();
    Ok(crate::viewmodels::ingest_vm::ipc_cancel_disk_imaging(ctx))
}

#[tauri::command]
pub fn ipc_generate_panasonic_chapters(
    duration_sec: f64,
    interval_sec: Option<f64>,
) -> Vec<PanasonicChapter> {
    crate::viewmodels::ingest_vm::ipc_generate_panasonic_chapters(
        duration_sec,
        interval_sec.unwrap_or(900.0),
    )
}

#[tauri::command]
pub fn ipc_score_frame_candidate(
    mean_luma: f32,
    std_luma: f32,
    sharpness: f32,
) -> FrameCandidateScore {
    crate::viewmodels::ingest_vm::ipc_score_frame_candidate(mean_luma, std_luma, sharpness)
}

#[tauri::command]
pub fn ipc_build_thumbnail_extract_args(
    video_path: String,
    timestamp_sec: f64,
    output_jpg_path: String,
    ffmpeg_binary: Option<String>,
) -> Vec<String> {
    crate::viewmodels::ingest_vm::ipc_build_thumbnail_extract_args(
        &video_path,
        timestamp_sec,
        &output_jpg_path,
        ffmpeg_binary.as_deref().unwrap_or("ffmpeg"),
    )
}

#[tauri::command]
pub fn ipc_seconds_to_timecode(seconds: f64, include_ms: Option<bool>) -> String {
    crate::viewmodels::ingest_vm::ipc_seconds_to_timecode(seconds, include_ms.unwrap_or(true))
}

#[tauri::command]
pub fn ipc_get_part_path(final_path: String) -> String {
    crate::viewmodels::ingest_vm::ipc_get_part_path(&final_path)
}

#[tauri::command]
pub fn ipc_is_valid_media_extension(ext: String) -> bool {
    crate::viewmodels::ingest_vm::ipc_is_valid_media_extension(&ext)
}

#[tauri::command]
pub fn ipc_classify_video_frame(frame_bytes: Vec<u8>) -> FrameSignalMetrics {
    crate::viewmodels::capture_vm::ipc_classify_video_frame(&frame_bytes)
}

#[tauri::command]
pub fn ipc_evaluate_preflight(
    disk_free_bytes: u64,
    min_disk_gb: Option<f64>,
    ffmpeg_available: Option<bool>,
    obs_available: Option<bool>,
) -> PreflightDiagnostics {
    crate::viewmodels::capture_vm::ipc_evaluate_preflight(
        disk_free_bytes,
        min_disk_gb.unwrap_or(50.0),
        ffmpeg_available.unwrap_or(true),
        obs_available.unwrap_or(true),
    )
}

#[tauri::command]
pub fn ipc_compute_obs_auth_response(password: String, salt: String, challenge: String) -> String {
    crate::viewmodels::capture_vm::ipc_compute_obs_auth_response(&password, &salt, &challenge)
}

#[tauri::command]
pub fn ipc_generate_qc_report(assessment: Value) -> Result<String, String> {
    let qc: FileQcAssessment = serde_json::from_value(assessment)
        .map_err(|e| format!("Invalid QC assessment JSON: {e}"))?;
    Ok(crate::viewmodels::capture_vm::ipc_generate_qc_report(&qc))
}

#[tauri::command]
pub fn ipc_mul_to_db(mul: f64) -> f64 {
    crate::viewmodels::capture_vm::ipc_mul_to_db(mul)
}

#[tauri::command]
pub fn ipc_db_to_mul(db: f64) -> f64 {
    crate::viewmodels::capture_vm::ipc_db_to_mul(db)
}

#[tauri::command]
pub fn ipc_analyze_visual_frame(
    pixels: Vec<RgbPixel>,
    prev_pixels: Option<Vec<RgbPixel>>,
) -> Option<VisualFrameAnalysis> {
    crate::viewmodels::capture_vm::ipc_analyze_visual_frame(&pixels, prev_pixels.as_deref())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn ipc_evaluate_capture_trigger(
    is_recording: bool,
    has_audio: bool,
    visual: Option<VisualFrameAnalysis>,
    active_duration_sec: f64,
    blank_silence_duration_sec: f64,
    quiet_scene_duration_sec: f64,
    start_confirm_sec: Option<f64>,
    stop_blank_confirm_sec: Option<f64>,
    stop_quiet_scene_sec: Option<f64>,
) -> CaptureTriggerDecision {
    crate::viewmodels::capture_vm::ipc_evaluate_capture_trigger(
        is_recording,
        has_audio,
        visual.as_ref(),
        active_duration_sec,
        blank_silence_duration_sec,
        quiet_scene_duration_sec,
        start_confirm_sec.unwrap_or(0.1),
        stop_blank_confirm_sec.unwrap_or(3.5),
        stop_quiet_scene_sec.unwrap_or(25.0),
    )
}
