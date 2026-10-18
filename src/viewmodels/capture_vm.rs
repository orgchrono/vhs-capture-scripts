//! Capture, TBC Telemetry & Broadcast QC ViewModel (`viewmodels::capture_vm`).
//!
//! Exposes typed Tauri IPC commands for UYVY422 TBC frame classification,
//! ITU-R BT.601 broadcast QC, EBU R128 audio analysis, real-time stream frame
//! stepping, OBS WebSocket authentication, and capture triggers.

use crate::domain::audio::{analyze_interleaved_stereo, AudioComplianceReport};
use crate::domain::qc::{
    generate_qc_markdown_report, inspect_frame_qc, FileQcAssessment, FrameQcReport,
};
use crate::domain::stream::{
    compute_mean_luma, step_stream_frame, FrameStepResult, StreamProcessingMode, StreamState,
};
use crate::domain::tbc::{classify_uyvy422_frame, FrameSignalMetrics, LUMA_STRIDE_STEP};
use crate::infrastructure::obs::{
    analyze_visual_frame_rgb, compute_obs_auth_response, db_to_mul, evaluate_capture_trigger,
    mul_to_db, CaptureTriggerDecision, RgbPixel, VisualFrameAnalysis,
};
use crate::infrastructure::preflight::{evaluate_preflight, PreflightDiagnostics};

/// Typed IPC ViewModel command classifying a UYVY422 video frame for TBC telemetry.
#[must_use]
pub fn ipc_classify_video_frame(frame_bytes: &[u8]) -> FrameSignalMetrics {
    classify_uyvy422_frame(frame_bytes, LUMA_STRIDE_STEP)
}

/// Typed IPC ViewModel command performing ITU-R BT.601 broadcast QC on planar video buffers.
#[must_use]
pub fn ipc_inspect_frame_qc(
    y_plane: &[u8],
    u_plane: &[u8],
    v_plane: &[u8],
    width: usize,
    height: usize,
) -> FrameQcReport {
    inspect_frame_qc(y_plane, u_plane, v_plane, width, height)
}

/// Typed IPC ViewModel command generating an archival QC inspection markdown report.
#[must_use]
pub fn ipc_generate_qc_report(assessment: &FileQcAssessment) -> String {
    generate_qc_markdown_report(assessment)
}

/// Typed IPC ViewModel command analyzing stereo audio for EBU R128 / ATSC A/85 compliance.
#[must_use]
pub fn ipc_analyze_audio_track(interleaved_samples: &[f32]) -> AudioComplianceReport {
    analyze_interleaved_stereo(interleaved_samples)
}

/// Typed IPC ViewModel command executing a pure streaming step over a planar frame.
#[must_use]
pub fn ipc_step_stream_frame(
    state: StreamState,
    mode: StreamProcessingMode,
    y_plane: &[u8],
    stride: usize,
    luma_threshold: f32,
    has_last_good_frame: bool,
    streak_break_limit: u64,
) -> FrameStepResult {
    step_stream_frame(
        state,
        mode,
        y_plane,
        stride,
        luma_threshold,
        has_last_good_frame,
        streak_break_limit,
    )
}

/// Typed IPC ViewModel command computing mean luma of planar Y buffer.
#[must_use]
pub fn ipc_compute_mean_luma(y_plane: &[u8], stride: usize) -> f32 {
    compute_mean_luma(y_plane, stride)
}

/// Typed IPC ViewModel command evaluating preflight system readiness.
#[must_use]
pub fn ipc_evaluate_preflight(
    disk_free_bytes: u64,
    min_disk_gb: f64,
    ffmpeg_available: bool,
    obs_available: bool,
) -> PreflightDiagnostics {
    evaluate_preflight(disk_free_bytes, min_disk_gb, ffmpeg_available, obs_available)
}

/// Typed IPC ViewModel command computing OBS WebSocket challenge-response authentication.
#[must_use]
pub fn ipc_compute_obs_auth_response(password: &str, salt: &str, challenge: &str) -> String {
    compute_obs_auth_response(password, salt, challenge)
}

/// Typed IPC ViewModel command converting audio multiplier to decibels.
#[must_use]
pub fn ipc_mul_to_db(mul: f64) -> f64 {
    mul_to_db(mul)
}

/// Typed IPC ViewModel command converting decibels to audio multiplier.
#[must_use]
pub fn ipc_db_to_mul(db: f64) -> f64 {
    db_to_mul(db)
}

/// Typed IPC ViewModel command analyzing raw RGB pixel buffer for OBS monitor.
#[must_use]
pub fn ipc_analyze_visual_frame(
    pixels: &[RgbPixel],
    prev_pixels: Option<&[RgbPixel]>,
) -> Option<VisualFrameAnalysis> {
    analyze_visual_frame_rgb(pixels, prev_pixels)
}

/// Typed IPC ViewModel command evaluating intelligent capture triggers.
#[must_use]
#[allow(clippy::too_many_arguments)]
pub fn ipc_evaluate_capture_trigger(
    is_recording: bool,
    has_audio: bool,
    visual: Option<&VisualFrameAnalysis>,
    active_duration_sec: f64,
    blank_silence_duration_sec: f64,
    quiet_scene_duration_sec: f64,
    start_confirm_sec: f64,
    stop_blank_confirm_sec: f64,
    stop_quiet_scene_sec: f64,
) -> CaptureTriggerDecision {
    evaluate_capture_trigger(
        is_recording,
        has_audio,
        visual,
        active_duration_sec,
        blank_silence_duration_sec,
        quiet_scene_duration_sec,
        start_confirm_sec,
        stop_blank_confirm_sec,
        stop_quiet_scene_sec,
    )
}
