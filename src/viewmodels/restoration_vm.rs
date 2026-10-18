//! Restoration ViewModel (`viewmodels::restoration_vm`).
//!
//! Exposes typed Tauri IPC commands for video/audio restoration filtergraphs,
//! VapourSynth QTGMC scripts, AI upscaling/interpolation, chapter generation,
//! checkpoint recovery, and native job execution.

use crate::domain::ai::{
    build_codeformer_command, build_realesrgan_command, build_rife_command,
    calculate_optimal_tile_size, CodeFormerParams, RealEsrganParams, RifeParams,
};
use crate::domain::chapters::{
    generate_ffmetadata_text, generate_webvtt_text, parse_scenedetect_csv, ChapterInterval,
};
use crate::domain::filter::{
    build_audio_filtergraph, build_muxing_cli_args, build_video_filtergraph, AudioFilterSpec,
    MuxingSpec, VideoFilterSpec,
};
use crate::domain::pipeline::{build_pipeline_plan, OutputCodec, PipelinePlan, PipelineSpec};
use crate::domain::qtgmc::{build_qtgmc_script_content, build_vspipe_cli_args, QtgmcScriptParams};
use crate::domain::recovery::{assess_checkpoint, CheckpointData, JobRecoveryAssessment};
use crate::domain::whisper::{
    build_audio_extract_args, disambiguate_speech_language, generate_srt_content,
    generate_vtt_content, SubtitleSegment,
};
use crate::infrastructure::executor::{
    execute_restoration_job, plan_restoration_job, resolve_final_output_path, PlannedRestoration,
    RestorationJobRequest, RestorationSummary,
};
use crate::infrastructure::probe::MediaProbeResult;
use crate::infrastructure::runner::{format_eta_duration, parse_progress_key_value};
use crate::models::presets::{PresetConfig, RestorationPreset};

/// Typed IPC ViewModel command returning the canonical SSOT configuration for a preset.
#[must_use]
pub fn ipc_get_preset_config(preset: RestorationPreset) -> PresetConfig {
    PresetConfig::from_preset(preset)
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
    let data: CheckpointData = serde_json::from_str(checkpoint_json)
        .map_err(|e| format!("Invalid checkpoint JSON: {e}"))?;
    Ok(assess_checkpoint(job_id, &data, source_exists))
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

/// Typed IPC ViewModel command calculating optimal tile size from VRAM in GB.
#[must_use]
pub fn ipc_calculate_optimal_tile_size(vram_gb: f32) -> u32 {
    calculate_optimal_tile_size(vram_gb)
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

/// Typed IPC ViewModel command building FFmpeg arguments for extracting 16kHz audio for Whisper.
#[must_use]
pub fn ipc_build_audio_extract_args(
    video_path: &str,
    output_wav_path: &str,
    ffmpeg_binary: &str,
) -> Vec<String> {
    build_audio_extract_args(video_path, output_wav_path, ffmpeg_binary)
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

/// Typed IPC ViewModel command executing a planned restoration job natively.
pub fn ipc_execute_restoration_job(
    planned: PlannedRestoration,
    cancel_flag: Option<&std::sync::atomic::AtomicBool>,
) -> Result<RestorationSummary, String> {
    execute_restoration_job(&planned, cancel_flag, None)
}
