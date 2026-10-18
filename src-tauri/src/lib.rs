//! VHS Studio Pro - Rust Functional Core & Tauri v2 IPC Bridge (`vhs_studio_core`).
//!
//! Architecture:
//! - `presets`: Canonical SSOT Restoration Presets modeled as Algebraic Data Types.
//! - `tbc`: Pure functional UYVY422 Time Base Corrector signal classifier and frame-hold state machine.
//! - `meihdfs`: Zero-copy Panasonic DVR (`MEIHDFS` / `DVD_RTAV`) binary header inspector.
//! - `fixity`: Cryptographic SHA-256 OAIS archival fixity computation and verification.
//! - `qc`: Pure functional ITU-R BT.601 broadcast quality control and dropout analyzer.
//! - `audio`: Pure functional audio analysis and EBU R128 / ATSC A/85 channel balancer.
//! - `pipeline`: Pure functional DAG restoration pipeline planner and filtergraph compiler.
//! - `chapters`: Pure functional scene detection parser and FFmetadata/WebVTT generator.
//! - `recovery`: Pure functional restoration checkpoint validator and recovery state machine.

pub mod ai;
pub mod audio;
pub mod chapters;
pub mod fixity;
pub mod hardware;
pub mod meihdfs;
pub mod panasonic;
pub mod pipeline;
pub mod presets;
pub mod qc;
pub mod queue;
pub mod recovery;
pub mod storage;
pub mod tbc;

use ai::{
    build_codeformer_command, build_realesrgan_command, build_rife_command,
    calculate_optimal_tile_size, CodeFormerParams, RealEsrganParams, RifeParams,
};
use audio::{analyze_interleaved_stereo, AudioComplianceReport};
use chapters::{
    generate_ffmetadata_text, generate_webvtt_text, parse_scenedetect_csv, ChapterInterval,
};
use fixity::compute_sha256_hex;
use hardware::{
    assess_hardware, resolve_optimal_encoder_args, GpuType, HardwareAssessment, HardwareSpecs,
};
use meihdfs::{inspect_panasonic_probe, IngestProbeError, PanasonicMediaDescriptor};
use pipeline::{build_pipeline_plan, PipelinePlan, PipelineSpec};
use presets::{PresetConfig, RestorationPreset};
use qc::{inspect_frame_qc, FrameQcReport};
use recovery::{assess_checkpoint, CheckpointData, JobRecoveryAssessment};
use tbc::{classify_uyvy422_frame, FrameSignalMetrics, LUMA_STRIDE_STEP};

/// Typed IPC ViewModel command returning the canonical SSOT configuration for a preset.
#[must_use]
pub fn ipc_get_preset_config(preset: RestorationPreset) -> PresetConfig {
    PresetConfig::from_preset(preset)
}

/// Typed IPC ViewModel command classifying a UYVY422 video frame for TBC telemetry.
#[must_use]
pub fn ipc_classify_video_frame(frame_bytes: &[u8]) -> FrameSignalMetrics {
    classify_uyvy422_frame(frame_bytes, LUMA_STRIDE_STEP)
}

/// Typed IPC ViewModel command inspecting a Panasonic DVR disk header probe.
pub fn ipc_inspect_panasonic_media(
    probe_bytes: &[u8],
    total_size_bytes: u64,
    has_frm_extension: bool,
) -> Result<PanasonicMediaDescriptor, IngestProbeError> {
    inspect_panasonic_probe(probe_bytes, total_size_bytes, has_frm_extension)
}

/// Typed IPC ViewModel command computing cryptographic SHA-256 fixity.
#[must_use]
pub fn ipc_compute_sha256(payload: &[u8]) -> String {
    compute_sha256_hex(payload)
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

/// Typed IPC ViewModel command analyzing stereo audio for EBU R128 / ATSC A/85 compliance.
#[must_use]
pub fn ipc_analyze_audio_track(interleaved_samples: &[f32]) -> AudioComplianceReport {
    analyze_interleaved_stereo(interleaved_samples)
}

/// Typed IPC ViewModel command generating deterministic FFmpeg/VapourSynth pipeline execution plans.
#[must_use]
pub fn ipc_build_pipeline_plan(spec: PipelineSpec) -> PipelinePlan {
    build_pipeline_plan(spec)
}

/// Typed IPC ViewModel command parsing scene detect CSV and generating FFmetadata & WebVTT.
#[must_use]
pub fn ipc_parse_chapters(
    csv_content: &str,
    title: &str,
    chapter_prefix: Option<&str>,
) -> (Vec<ChapterInterval>, String, String) {
    let intervals = parse_scenedetect_csv(csv_content);
    let ffmeta = generate_ffmetadata_text(title, &intervals, chapter_prefix);
    let webvtt = generate_webvtt_text(&intervals, chapter_prefix);
    (intervals, ffmeta, webvtt)
}

/// Typed IPC ViewModel command validating and assessing a checkpoint JSON payload.
pub fn ipc_assess_checkpoint(
    job_id: String,
    checkpoint_json: &str,
    source_exists: bool,
) -> Result<JobRecoveryAssessment, String> {
    let data: CheckpointData =
        serde_json::from_str(checkpoint_json).map_err(|e| format!("Invalid checkpoint JSON: {e}"))?;
    Ok(assess_checkpoint(job_id, &data, source_exists))
}

/// Typed IPC ViewModel command evaluating hardware specifications into an operational tier.
#[must_use]
pub fn ipc_assess_hardware(specs: &HardwareSpecs) -> HardwareAssessment {
    assess_hardware(specs)
}

/// Typed IPC ViewModel command resolving optimal encoder arguments.
#[must_use]
pub fn ipc_resolve_encoder_args(preference: &str, platform: &str, gpu_type: &GpuType) -> Vec<String> {
    resolve_optimal_encoder_args(preference, platform, gpu_type)
}

/// Typed IPC ViewModel command building Real-ESRGAN CLI arguments.
#[must_use]
pub fn ipc_build_realesrgan_command(params: &RealEsrganParams) -> Vec<String> {
    build_realesrgan_command(params)
}

/// Typed IPC ViewModel command building CodeFormer CLI arguments.
#[must_use]
pub fn ipc_build_codeformer_command(params: &CodeFormerParams) -> Vec<String> {
    build_codeformer_command(params)
}

/// Typed IPC ViewModel command building RIFE motion interpolation CLI arguments.
#[must_use]
pub fn ipc_build_rife_command(params: &RifeParams) -> Vec<String> {
    build_rife_command(params)
}

use panasonic::{
    classify_panasonic_probe, evaluate_panasonic_drive, generate_panasonic_chapters,
    PanasonicChapter, PanasonicDriveHeuristic, PanasonicInspection,
};
use queue::{
    calculate_queue_stats, order_queue, select_next_pending_job, transition_job_status, JobRecord,
    JobStatus, QueueStats,
};
use storage::{
    format_destination_key, validate_storage_config, verify_capacity, StorageConfig,
};

/// Typed IPC ViewModel command calculating optimal tile size from VRAM in GB.
#[must_use]
pub fn ipc_calculate_optimal_tile_size(vram_gb: f32) -> u32 {
    calculate_optimal_tile_size(vram_gb)
}

/// Typed IPC ViewModel command classifying Panasonic DVR probe buffers.
#[must_use]
pub fn ipc_classify_panasonic_probe(
    probe_bytes: &[u8],
    source_size_bytes: u64,
    filename_lower: &str,
) -> PanasonicInspection {
    classify_panasonic_probe(probe_bytes, source_size_bytes, filename_lower)
}

/// Typed IPC ViewModel command generating deterministic Panasonic chapter markers.
#[must_use]
pub fn ipc_generate_panasonic_chapters(duration_sec: f64, interval_sec: f64) -> Vec<PanasonicChapter> {
    generate_panasonic_chapters(duration_sec, interval_sec)
}

/// Typed IPC ViewModel command evaluating Panasonic drive and bus characteristics.
#[must_use]
pub fn ipc_evaluate_panasonic_drive(model: &str, iface: &str, pnp: &str) -> PanasonicDriveHeuristic {
    evaluate_panasonic_drive(model, iface, pnp)
}

/// Typed IPC ViewModel command transitioning job lifecycle states.
pub fn ipc_transition_job_status(
    job: JobRecord,
    new_status: JobStatus,
    error_message: Option<String>,
    timestamp: &str,
) -> Result<JobRecord, &'static str> {
    transition_job_status(job, new_status, error_message, timestamp)
}

/// Typed IPC ViewModel command sorting batch jobs by priority and ID.
#[must_use]
pub fn ipc_order_queue(jobs: &[JobRecord]) -> Vec<JobRecord> {
    order_queue(jobs)
}

/// Typed IPC ViewModel command selecting next pending job in queue.
#[must_use]
pub fn ipc_select_next_pending_job(jobs: &[JobRecord]) -> Option<JobRecord> {
    select_next_pending_job(jobs)
}

/// Typed IPC ViewModel command calculating batch queue status metrics.
#[must_use]
pub fn ipc_calculate_queue_stats(jobs: &[JobRecord]) -> QueueStats {
    calculate_queue_stats(jobs)
}

/// Typed IPC ViewModel command validating storage configuration parameters.
pub fn ipc_validate_storage_config(config: &StorageConfig) -> Result<(), &'static str> {
    validate_storage_config(config)
}

/// Typed IPC ViewModel command verifying storage capacity margin.
pub fn ipc_verify_storage_capacity(available_bytes: u64, required_bytes: u64) -> Result<(), &'static str> {
    verify_capacity(available_bytes, required_bytes)
}

/// Typed IPC ViewModel command formatting destination storage object keys.
#[must_use]
pub fn ipc_format_destination_key(base_folder: &str, relative_path: &str) -> String {
    format_destination_key(base_folder, relative_path)
}



