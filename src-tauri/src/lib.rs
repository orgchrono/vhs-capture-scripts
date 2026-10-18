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
pub mod archive;
pub mod audio;
pub mod chapters;
pub mod filter;
pub mod fixity;
pub mod hardware;
pub mod meihdfs;
pub mod panasonic;
pub mod pipeline;
pub mod presets;
pub mod qc;
pub mod qtgmc;
pub mod queue;
pub mod recovery;
pub mod storage;
pub mod stream;
pub mod tbc;
pub mod preflight;
pub mod thumbnail;
pub mod probe;
pub mod runner;
pub mod media;
pub mod package;
pub mod obs;
pub mod preferences;
pub mod whisper;
pub mod lock;
pub mod oauth;
pub mod config;
pub mod toolchain;
pub mod executor;

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

use archive::{
    generate_bagit_declaration, generate_bagit_manifest, generate_premis_v3_xml,
    generate_tape_sidecar_json, ArchivalFileEntry,
};
use qtgmc::{build_qtgmc_script_content, build_vspipe_cli_args, QtgmcScriptParams};
use stream::{
    compute_mean_luma, step_stream_frame, FrameStepResult, StreamProcessingMode, StreamState,
};

/// Typed IPC ViewModel command formatting destination storage object keys.
#[must_use]
pub fn ipc_format_destination_key(base_folder: &str, relative_path: &str) -> String {
    format_destination_key(base_folder, relative_path)
}

/// Typed IPC ViewModel command returning BagIt declaration text.
#[must_use]
pub fn ipc_generate_bagit_declaration() -> &'static str {
    generate_bagit_declaration()
}

/// Typed IPC ViewModel command generating BagIt SHA-256 manifest.
#[must_use]
pub fn ipc_generate_bagit_manifest(entries: &[ArchivalFileEntry]) -> String {
    generate_bagit_manifest(entries)
}

/// Typed IPC ViewModel command generating PREMIS v3 preservation XML.
#[must_use]
pub fn ipc_generate_premis_v3_xml(filename: &str, size_bytes: u64, sha256_hex: &str) -> String {
    generate_premis_v3_xml(filename, size_bytes, sha256_hex)
}

/// Typed IPC ViewModel command generating VHS sidecar JSON metadata.
#[must_use]
pub fn ipc_generate_tape_sidecar_json(
    filename: &str,
    timestamp: f64,
    metadata: &serde_json::Value,
) -> String {
    generate_tape_sidecar_json(filename, timestamp, metadata)
}

/// Typed IPC ViewModel command building VapourSynth QTGMC script content.
#[must_use]
pub fn ipc_build_qtgmc_script_content(params: &QtgmcScriptParams) -> String {
    build_qtgmc_script_content(params)
}

/// Typed IPC ViewModel command building vspipe execution CLI arguments.
#[must_use]
pub fn ipc_build_vspipe_cli_args(vspipe_binary: &str, vpy_path: &str) -> Vec<String> {
    build_vspipe_cli_args(vspipe_binary, vpy_path)
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

use filter::{
    build_audio_filtergraph, build_muxing_cli_args, build_video_filtergraph, AudioFilterSpec,
    MuxingSpec, VideoFilterSpec,
};

/// Typed IPC ViewModel command compiling video filtergraph chains.
#[must_use]
pub fn ipc_build_video_filtergraph(spec: &VideoFilterSpec) -> String {
    build_video_filtergraph(spec)
}

/// Typed IPC ViewModel command compiling audio filtergraph chains.
#[must_use]
pub fn ipc_build_audio_filtergraph(spec: &AudioFilterSpec) -> String {
    build_audio_filtergraph(spec)
}

/// Typed IPC ViewModel command compiling output muxing CLI arguments.
#[must_use]
pub fn ipc_build_muxing_cli_args(
    spec: &MuxingSpec,
    video_filter: &str,
    audio_filter: &str,
    ffmpeg_binary: &str,
) -> Vec<String> {
    build_muxing_cli_args(spec, video_filter, audio_filter, ffmpeg_binary)
}

use preflight::{evaluate_preflight, PreflightDiagnostics};
use thumbnail::{
    build_thumbnail_extract_args, compute_thumbnail_cache_filename, score_frame_candidate,
    FrameCandidateScore,
};

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

/// Typed IPC ViewModel command evaluating candidate frame quality for thumbnails.
#[must_use]
pub fn ipc_score_frame_candidate(
    mean_luma: f32,
    std_luma: f32,
    sharpness: f32,
) -> FrameCandidateScore {
    score_frame_candidate(mean_luma, std_luma, sharpness)
}

/// Typed IPC ViewModel command computing deterministic thumbnail cache filename.
#[must_use]
pub fn ipc_compute_thumbnail_cache_filename(
    video_path: &str,
    mtime_sec: u64,
    size_bytes: u64,
) -> String {
    compute_thumbnail_cache_filename(video_path, mtime_sec, size_bytes)
}

/// Typed IPC ViewModel command building FFmpeg thumbnail extraction CLI arguments.
#[must_use]
pub fn ipc_build_thumbnail_extract_args(
    video_path: &str,
    timestamp_sec: f64,
    output_jpg_path: &str,
    ffmpeg_binary: &str,
) -> Vec<String> {
    build_thumbnail_extract_args(video_path, timestamp_sec, output_jpg_path, ffmpeg_binary)
}

use probe::{build_ffprobe_args, parse_ffprobe_json, MediaProbeResult};
use runner::{format_eta_duration, parse_progress_key_value};
use media::{generate_param_hash, get_part_path, is_valid_media_extension, seconds_to_timecode};
use package::{get_ffmpeg_install_command, has_ffmpeg_encoder, has_ffmpeg_filter, PackageManager};

/// Typed IPC ViewModel command parsing FFprobe JSON string.
pub fn ipc_parse_ffprobe_json(json_content: &str, file_path: &str) -> Result<MediaProbeResult, String> {
    parse_ffprobe_json(json_content, file_path)
}

/// Typed IPC ViewModel command generating FFprobe CLI arguments.
#[must_use]
pub fn ipc_build_ffprobe_args(file_path: &str) -> Vec<String> {
    build_ffprobe_args(file_path)
}

/// Typed IPC ViewModel command parsing single FFmpeg progress line into key-value.
#[must_use]
pub fn ipc_parse_progress_line(line: &str) -> Option<(String, String)> {
    parse_progress_key_value(line).map(|(k, v)| (k.to_string(), v.to_string()))
}

/// Typed IPC ViewModel command formatting ETA duration into HH:MM:SS.
#[must_use]
pub fn ipc_format_eta_duration(seconds: f64) -> String {
    format_eta_duration(seconds)
}

/// Typed IPC ViewModel command formatting broadcast timecode HH:MM:SS[.mmm].
#[must_use]
pub fn ipc_seconds_to_timecode(seconds: f64, include_ms: bool) -> String {
    seconds_to_timecode(seconds, include_ms)
}

/// Typed IPC ViewModel command resolving atomic intermediate path.
#[must_use]
pub fn ipc_get_part_path(final_path: &str) -> String {
    get_part_path(final_path)
}

/// Typed IPC ViewModel command generating 8-character parameter configuration hash.
#[must_use]
pub fn ipc_generate_param_hash(content: &[u8]) -> String {
    generate_param_hash(content)
}

/// Typed IPC ViewModel command checking if media extension is supported.
#[must_use]
pub fn ipc_is_valid_media_extension(ext: &str) -> bool {
    is_valid_media_extension(ext)
}

/// Typed IPC ViewModel command resolving FFmpeg install command for package manager.
#[must_use]
pub fn ipc_get_ffmpeg_install_command(mgr_name: &str) -> Option<Vec<String>> {
    let mgr = PackageManager::from_name(mgr_name);
    get_ffmpeg_install_command(&mgr)
}

/// Typed IPC ViewModel command verifying encoder presence in FFmpeg.
#[must_use]
pub fn ipc_has_ffmpeg_encoder(encoders_output: &str, encoder_name: &str) -> bool {
    has_ffmpeg_encoder(encoders_output, encoder_name)
}

/// Typed IPC ViewModel command verifying filter presence in FFmpeg.
#[must_use]
pub fn ipc_has_ffmpeg_filter(filters_output: &str, filter_name: &str) -> bool {
    has_ffmpeg_filter(filters_output, filter_name)
}

use obs::compute_obs_auth_response;
use preferences::{parse_preferences_json, validate_and_clamp_preferences, AppPreferences};
use whisper::{
    disambiguate_speech_language, generate_srt_content, generate_vtt_content, SubtitleSegment,
};

/// Typed IPC ViewModel command computing OBS WebSocket challenge-response authentication.
#[must_use]
pub fn ipc_compute_obs_auth_response(password: &str, salt: &str, challenge: &str) -> String {
    compute_obs_auth_response(password, salt, challenge)
}

/// Typed IPC ViewModel command parsing preferences JSON with dual-casing support and clamping.
#[must_use]
pub fn ipc_parse_preferences(json_content: &str) -> AppPreferences {
    parse_preferences_json(json_content)
}

/// Typed IPC ViewModel command validating and clamping preferences.
#[must_use]
pub fn ipc_validate_preferences(prefs: AppPreferences) -> AppPreferences {
    validate_and_clamp_preferences(prefs)
}

/// Typed IPC ViewModel command generating WebVTT subtitle document.
#[must_use]
pub fn ipc_format_vtt_subtitles(segments: &[SubtitleSegment]) -> String {
    generate_vtt_content(segments)
}

/// Typed IPC ViewModel command generating SubRip (.srt) subtitle document.
#[must_use]
pub fn ipc_format_srt_subtitles(segments: &[SubtitleSegment]) -> String {
    generate_srt_content(segments)
}

/// Typed IPC ViewModel command disambiguating speech language to prevent tape noise hallucination.
#[must_use]
pub fn ipc_disambiguate_speech_language(
    detected_lang: &str,
    prob: f32,
    has_speech: bool,
) -> (String, bool) {
    disambiguate_speech_language(detected_lang, prob, has_speech)
}

use lock::{evaluate_lock_decision, format_lock_content, parse_lock_pid, LockDecision};

/// Typed IPC ViewModel command parsing PID from lock file.
#[must_use]
pub fn ipc_parse_lock_pid(content: &str) -> Option<u32> {
    parse_lock_pid(content)
}

/// Typed IPC ViewModel command evaluating lock decision.
#[must_use]
pub fn ipc_evaluate_lock_decision(
    existing_pid: Option<u32>,
    is_existing_active: bool,
    current_pid: u32,
) -> LockDecision {
    evaluate_lock_decision(existing_pid, is_existing_active, current_pid)
}

/// Typed IPC ViewModel command formatting lock content string.
#[must_use]
pub fn ipc_format_lock_content(pid: u32, label: &str) -> String {
    format_lock_content(pid, label)
}

use oauth::{build_oauth_auth_url, parse_oauth_token_response, OAuthProvider, OAuthTokenResponse};

/// Typed IPC ViewModel command building OAuth authorization redirect URL.
#[must_use]
pub fn ipc_build_oauth_auth_url(
    provider: OAuthProvider,
    client_id: &str,
    redirect_uri: &str,
    state: &str,
) -> String {
    build_oauth_auth_url(provider, client_id, redirect_uri, state)
}

/// Typed IPC ViewModel command parsing OAuth token response JSON.
pub fn ipc_parse_oauth_token_response(json_body: &str) -> Result<OAuthTokenResponse, String> {
    parse_oauth_token_response(json_body)
}

use config::{parse_advanced_toml, AdvancedConfig};

/// Typed IPC ViewModel command parsing advanced TOML configuration.
#[must_use]
pub fn ipc_parse_advanced_toml(toml_content: &str) -> AdvancedConfig {
    parse_advanced_toml(toml_content)
}

use toolchain::{
    check_ffmpeg_encoder_in_output, check_ffmpeg_filter_in_output, format_binary_name,
    resolve_executable_path, verify_binary_integrity,
};

/// Typed IPC ViewModel command resolving binary path on host system.
#[must_use]
pub fn ipc_resolve_tool_path(
    tool_name: &str,
    project_root: Option<&str>,
    user_home: Option<&str>,
) -> Option<String> {
    let root = project_root.map(std::path::Path::new);
    let home = user_home.map(std::path::Path::new);
    resolve_executable_path(tool_name, root, home).map(|p| p.to_string_lossy().to_string())
}

/// Typed IPC ViewModel command verifying SHA-256 fixity of a binary against checksums manifest.
#[must_use]
pub fn ipc_verify_binary_integrity(
    binary_filename: &str,
    actual_sha256: &str,
    platform_key: &str,
    manifest_json: &str,
) -> (bool, String) {
    verify_binary_integrity(binary_filename, actual_sha256, platform_key, manifest_json)
}

/// Typed IPC ViewModel command formatting binary name with platform extension (.exe).
#[must_use]
pub fn ipc_format_binary_name(base_name: &str) -> String {
    format_binary_name(base_name)
}

/// Typed IPC ViewModel command checking if encoder or filter exists in ffmpeg capability text.
#[must_use]
pub fn ipc_check_ffmpeg_capability(
    output_text: &str,
    name: &str,
    is_filter: bool,
) -> bool {
    if is_filter {
        check_ffmpeg_filter_in_output(output_text, name)
    } else {
        check_ffmpeg_encoder_in_output(output_text, name)
    }
}

use executor::{plan_restoration_job, resolve_final_output_path, PlannedRestoration, RestorationJobRequest};
use pipeline::OutputCodec;

/// Typed IPC ViewModel command resolving destination output path for restoration.
#[must_use]
pub fn ipc_resolve_final_output_path(
    input_path: &str,
    output_dir: &str,
    preset: RestorationPreset,
    codec: OutputCodec,
    target_1080p: bool,
) -> String {
    resolve_final_output_path(input_path, output_dir, preset, codec, target_1080p)
        .to_string_lossy()
        .to_string()
}

/// Typed IPC ViewModel command creating a deterministic restoration execution plan.
pub fn ipc_plan_restoration_job(
    request: RestorationJobRequest,
    probe: MediaProbeResult,
    vspipe_path_opt: Option<&str>,
    ffmpeg_binary: &str,
) -> Result<PlannedRestoration, String> {
    plan_restoration_job(&request, &probe, vspipe_path_opt, ffmpeg_binary)
}

