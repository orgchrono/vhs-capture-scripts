//! Typed Tauri v2 IPC Command Handlers.
//!
//! Provides `#[tauri::command]` entrypoints bridging the React UI running
//! inside OS WebView (WebView2 on Windows, WebKitGTK on Linux, WKWebView on macOS)
//! with the pure Rust functional core.

use crate::domain::archive::ArchivalFileEntry;
use crate::domain::chapters::ChapterInterval;
use crate::domain::pipeline::OutputCodec;
use crate::domain::qtgmc::QtgmcScriptParams;
use crate::domain::queue::{JobRecord, QueueStats};
use crate::domain::tbc::FrameSignalMetrics;
use crate::domain::whisper::SubtitleSegment;
use crate::domain::ai::RealEsrganParams;
use crate::infrastructure::executor::{
    PlannedRestoration, RestorationJobRequest, RestorationSummary,
};
use crate::infrastructure::hardware::{HardwareAssessment, HardwareSpecs};
use crate::infrastructure::lock::LockDecision;
use crate::infrastructure::obs::{
    CaptureTriggerDecision, RgbPixel, VisualFrameAnalysis,
};
use crate::infrastructure::panasonic::{PanasonicChapter, PanasonicDiskInfo};
use crate::infrastructure::preflight::PreflightDiagnostics;
use crate::infrastructure::probe::MediaProbeResult;
use crate::domain::qc::FileQcAssessment;
use crate::infrastructure::storage::{ChunkUploadPart, StorageConfigEnvelope, StorageStatus};
use crate::infrastructure::thumbnail::FrameCandidateScore;
use crate::models::config::AdvancedConfig;
use crate::models::preferences::AppPreferences;
use crate::models::presets::{PresetConfig, RestorationPreset};
use serde_json::{json, Value};
use std::path::Path;

fn parse_preset(preset: &str) -> RestorationPreset {
    match preset.to_ascii_lowercase().as_str() {
        "gold" => RestorationPreset::Gold,
        "speed" => RestorationPreset::Speed,
        "tbc_hold" | "tbchold" => RestorationPreset::TbcHold,
        "ai_master" | "aimaster" => RestorationPreset::AiMaster,
        _ => RestorationPreset::Custom,
    }
}

// ============================================================================
// SYSTEM & HARDWARE COMMANDS
// ============================================================================

#[tauri::command]
pub fn ipc_assess_hardware(specs: HardwareSpecs) -> HardwareAssessment {
    crate::viewmodels::system_vm::ipc_assess_hardware(&specs)
}

#[tauri::command]
pub fn ipc_calculate_optimal_tile_size(vram_gb: f32) -> u32 {
    crate::viewmodels::restoration_vm::ipc_calculate_optimal_tile_size(vram_gb)
}

#[tauri::command]
pub fn ipc_get_ffmpeg_install_command(mgr_name: String) -> Option<Vec<String>> {
    crate::viewmodels::system_vm::ipc_get_ffmpeg_install_command(&mgr_name)
}

#[tauri::command]
pub fn ipc_evaluate_lock_decision(
    existing_pid: Option<u32>,
    is_existing_active: bool,
    current_pid: u32,
) -> String {
    match crate::viewmodels::system_vm::ipc_evaluate_lock_decision(
        existing_pid,
        is_existing_active,
        current_pid,
    ) {
        LockDecision::Acquired => "acquired".to_string(),
        LockDecision::Blocked(_) => "blocked".to_string(),
        LockDecision::AlreadyOwned => "alreadyowned".to_string(),
    }
}

#[tauri::command]
pub fn ipc_parse_advanced_toml(toml_content: String) -> AdvancedConfig {
    crate::viewmodels::system_vm::ipc_parse_advanced_toml(&toml_content)
}

#[tauri::command]
pub fn ipc_resolve_tool_path(
    tool_name: String,
    project_root: Option<String>,
    user_home: Option<String>,
) -> Option<String> {
    crate::viewmodels::system_vm::ipc_resolve_tool_path(
        &tool_name,
        project_root.as_deref(),
        user_home.as_deref(),
    )
}

#[tauri::command]
pub fn ipc_verify_binary_integrity(
    binary_filename: String,
    actual_sha256: String,
    platform_key: String,
    manifest_json: String,
) -> (bool, String) {
    crate::viewmodels::system_vm::ipc_verify_binary_integrity(
        &binary_filename,
        &actual_sha256,
        &platform_key,
        &manifest_json,
    )
}

#[tauri::command]
pub fn ipc_format_binary_name(base_name: String) -> String {
    crate::viewmodels::system_vm::ipc_format_binary_name(&base_name)
}

#[tauri::command]
pub fn ipc_check_ffmpeg_capability(output_text: String, name: String, is_filter: bool) -> bool {
    crate::viewmodels::system_vm::ipc_check_ffmpeg_capability(&output_text, &name, is_filter)
}

#[tauri::command]
pub fn ipc_parse_preferences(json_content: String) -> AppPreferences {
    crate::viewmodels::system_vm::ipc_parse_preferences(&json_content)
}

#[tauri::command]
pub fn ipc_get_preferences() -> Value {
    let prefs = crate::viewmodels::api_support::load_preferences();
    crate::models::preferences::to_ui_json(&prefs)
}

#[tauri::command]
pub fn ipc_save_preferences(preferences: Value) -> Result<Value, String> {
    let current = crate::viewmodels::api_support::load_preferences();
    let merged = crate::models::preferences::merge_preferences(&current, &preferences);
    crate::viewmodels::api_support::save_preferences(&merged)?;
    Ok(json!({
        "success": true,
        "preferences": crate::models::preferences::to_ui_json(&merged)
    }))
}

// ============================================================================
// RESTORATION & PIPELINE COMMANDS
// ============================================================================

#[tauri::command]
pub fn ipc_get_preset_config(preset: String) -> PresetConfig {
    crate::viewmodels::restoration_vm::ipc_get_preset_config(parse_preset(&preset))
}

#[tauri::command]
pub fn ipc_build_realesrgan_command(params: RealEsrganParams) -> Vec<String> {
    crate::viewmodels::restoration_vm::ipc_build_realesrgan_command(&params)
}

#[tauri::command]
pub fn ipc_build_qtgmc_script_content(params: QtgmcScriptParams) -> String {
    crate::viewmodels::restoration_vm::ipc_build_qtgmc_script_content(&params)
}

#[tauri::command]
pub fn ipc_build_vspipe_cli_args(vspipe_binary: String, vpy_path: String) -> Vec<String> {
    crate::viewmodels::restoration_vm::ipc_build_vspipe_cli_args(&vspipe_binary, &vpy_path)
}

#[tauri::command]
pub fn ipc_parse_chapters(
    csv_content: String,
    title: String,
    chapter_prefix: Option<String>,
) -> (Vec<ChapterInterval>, String, String) {
    crate::viewmodels::restoration_vm::ipc_parse_chapters(
        &csv_content,
        &title,
        chapter_prefix.as_deref(),
    )
}

#[tauri::command]
pub fn ipc_format_vtt_subtitles(segments: Vec<SubtitleSegment>) -> String {
    crate::viewmodels::restoration_vm::ipc_format_vtt_subtitles(&segments)
}

#[tauri::command]
pub fn ipc_format_srt_subtitles(segments: Vec<SubtitleSegment>) -> String {
    crate::viewmodels::restoration_vm::ipc_format_srt_subtitles(&segments)
}

#[tauri::command]
pub fn ipc_build_audio_extract_args(
    video_path: String,
    output_wav_path: String,
    ffmpeg_binary: Option<String>,
) -> Vec<String> {
    crate::viewmodels::restoration_vm::ipc_build_audio_extract_args(
        &video_path,
        &output_wav_path,
        ffmpeg_binary.as_deref().unwrap_or("ffmpeg"),
    )
}

#[tauri::command]
pub fn ipc_disambiguate_speech_language(
    detected_lang: String,
    prob: f64,
    has_speech: bool,
) -> (String, bool) {
    crate::viewmodels::restoration_vm::ipc_disambiguate_speech_language(
        &detected_lang,
        prob as f32,
        has_speech,
    )
}

#[tauri::command]
pub fn ipc_resolve_final_output_path(
    input_path: String,
    output_dir: String,
    preset: String,
    codec: String,
    target_1080p: bool,
    param_hash: Option<String>,
) -> String {
    let preset_val = parse_preset(&preset);
    let codec_val = crate::viewmodels::job_request_vm::map_output_codec(&codec).unwrap_or(OutputCodec::H264);
    crate::viewmodels::restoration_vm::ipc_resolve_final_output_path(
        &input_path,
        &output_dir,
        preset_val,
        codec_val,
        target_1080p,
        param_hash.as_deref(),
    )
}

#[tauri::command]
pub fn ipc_plan_restoration_job(
    request: Value,
    probe: Value,
    vspipe_path_opt: Option<String>,
    ffmpeg_binary: Option<String>,
) -> Result<PlannedRestoration, String> {
    let job_request: RestorationJobRequest = match serde_json::from_value::<RestorationJobRequest>(request.clone()) {
        Ok(r) => r,
        Err(_) => {
            let input_path = request
                .get("input_path")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let default_output = "restored";
            crate::viewmodels::job_request_vm::map_restoration_payload(&request, &input_path, default_output).request
        }
    };

    let media_probe: MediaProbeResult = match serde_json::from_value::<MediaProbeResult>(probe) {
        Ok(p) => p,
        Err(_) => MediaProbeResult {
            file_path: job_request.input_path.clone(),
            width: 720,
            height: 480,
            fps: 29.97,
            fps_rational: "30000/1001".to_string(),
            duration: 0.0,
            total_frames: 0,
            video_codec: "h264".to_string(),
            audio_codec: "aac".to_string(),
            audio_channels: 2,
            audio_sample_rate: 48000,
            field_order: "unknown".to_string(),
            is_interlaced: true,
            pix_fmt: "yuv420p".to_string(),
            color_space: "bt709".to_string(),
            color_primaries: "bt709".to_string(),
            color_transfer: "bt709".to_string(),
            format_name: "mov,mp4,m4a,3gp,3g2,mj2".to_string(),
            standard: "NTSC".to_string(),
        },
    };

    let resolved_vspipe = if crate::infrastructure::toolchain::is_qtgmc_viable() {
        vspipe_path_opt.or_else(|| {
            crate::infrastructure::toolchain::resolve_executable_path("vspipe", None, None)
                .map(|p| p.to_string_lossy().to_string())
        })
    } else {
        None
    };
    let resolved_ffmpeg = ffmpeg_binary.unwrap_or_else(|| {
        crate::infrastructure::toolchain::resolve_executable_path("ffmpeg", None, None)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "ffmpeg".to_string())
    });

    crate::viewmodels::restoration_vm::ipc_plan_restoration_job(
        job_request,
        media_probe,
        resolved_vspipe.as_deref(),
        &resolved_ffmpeg,
    )
}

#[tauri::command]
pub async fn ipc_execute_restoration_job(
    planned: PlannedRestoration,
) -> Result<RestorationSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::viewmodels::restoration_vm::ipc_execute_restoration_job(planned, None)
    })
    .await
    .map_err(|e| format!("Execution worker join error: {e}"))?
}

// ============================================================================
// INGEST & MEDIA PROBING COMMANDS
// ============================================================================

#[tauri::command]
pub fn ipc_probe_media_file(
    file_path: String,
    ffprobe_binary: String,
) -> Result<MediaProbeResult, String> {
    crate::viewmodels::ingest_vm::ipc_probe_media_file(&file_path, &ffprobe_binary)
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
pub fn ipc_detect_connected_drives() -> Vec<PanasonicDiskInfo> {
    crate::viewmodels::ingest_vm::ipc_detect_connected_drives()
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

// ============================================================================
// CAPTURE & AUDIO/VISUAL QC COMMANDS
// ============================================================================

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

// ============================================================================
// STORAGE & QUEUE COMMANDS
// ============================================================================

#[tauri::command]
pub fn ipc_compute_sha256(payload: Vec<u8>) -> String {
    crate::viewmodels::storage_vm::ipc_compute_sha256(&payload)
}

#[tauri::command]
pub fn ipc_order_queue(jobs: Vec<JobRecord>) -> Vec<JobRecord> {
    crate::viewmodels::storage_vm::ipc_order_queue(&jobs)
}

#[tauri::command]
pub fn ipc_calculate_queue_stats(jobs: Vec<JobRecord>) -> QueueStats {
    crate::viewmodels::storage_vm::ipc_calculate_queue_stats(&jobs)
}

#[tauri::command]
pub fn ipc_format_destination_key(base_folder: String, relative_path: String) -> String {
    crate::viewmodels::storage_vm::ipc_format_destination_key(&base_folder, &relative_path)
}

#[tauri::command]
pub fn ipc_generate_bagit_manifest(entries: Vec<ArchivalFileEntry>) -> String {
    crate::viewmodels::storage_vm::ipc_generate_bagit_manifest(&entries)
}

#[tauri::command]
pub fn ipc_generate_premis_v3_xml(
    filename: String,
    size_bytes: u64,
    sha256_hex: String,
) -> String {
    crate::viewmodels::storage_vm::ipc_generate_premis_v3_xml(&filename, size_bytes, &sha256_hex)
}

#[tauri::command]
pub fn ipc_evaluate_321_compliance(
    total_copies: usize,
    distinct_media_locations: usize,
    has_remote_or_cloud_copy: bool,
) -> bool {
    crate::viewmodels::storage_vm::ipc_evaluate_321_compliance(
        total_copies,
        distinct_media_locations,
        has_remote_or_cloud_copy,
    )
}

#[tauri::command]
pub fn ipc_build_oauth_auth_url(
    provider: String,
    client_id: String,
    redirect_uri: String,
    state: String,
) -> String {
    let prov = match provider.to_ascii_lowercase().as_str() {
        "dropbox" => crate::infrastructure::oauth::OAuthProvider::Dropbox,
        "onedrive" => crate::infrastructure::oauth::OAuthProvider::OneDrive,
        _ => crate::infrastructure::oauth::OAuthProvider::GDrive,
    };
    crate::viewmodels::storage_vm::ipc_build_oauth_auth_url(
        prov,
        &client_id,
        &redirect_uri,
        &state,
    )
}

#[tauri::command]
pub fn ipc_get_storage_config() -> StorageConfigEnvelope {
    crate::viewmodels::storage_vm::ipc_get_storage_config()
}

#[tauri::command]
pub fn ipc_save_storage_config(
    provider: String,
    config: Value,
) -> Result<StorageStatus, String> {
    crate::viewmodels::storage_vm::ipc_save_storage_config(&provider, &config)
}

#[tauri::command]
pub fn ipc_plan_chunk_upload(
    file_size_bytes: u64,
    chunk_size_bytes: u64,
) -> Vec<ChunkUploadPart> {
    crate::viewmodels::storage_vm::ipc_plan_chunk_upload(file_size_bytes, chunk_size_bytes)
}

#[tauri::command]
pub fn ipc_copy_storage_file(source: String, destination: String) -> Result<u64, String> {
    crate::viewmodels::storage_vm::ipc_copy_storage_file(&source, &destination)
}

// ============================================================================
// INCOMPLETE JOBS & COMPARISON FRAME
// ============================================================================

#[tauri::command]
pub fn ipc_get_incomplete_jobs() -> Value {
    let dirs = crate::viewmodels::api_support::media_dirs();
    let search_dirs = [dirs.restored.clone(), dirs.work.clone()];
    let raw_dirs = [dirs.raw.clone(), dirs.media.clone()];
    let jobs = crate::infrastructure::job_recovery::scan_incomplete_jobs(&search_dirs, &raw_dirs);
    let total = jobs.len();
    json!({
        "incomplete_jobs": jobs,
        "total": total
    })
}

#[tauri::command]
pub fn ipc_handle_incomplete_job(
    output_path: String,
    action: String,
    source: Option<String>,
) -> Result<Value, String> {
    let target = Path::new(&output_path);
    match action.to_ascii_lowercase().as_str() {
        "finalize" => {
            let ffmpeg_bin = crate::infrastructure::toolchain::resolve_executable_path("ffmpeg", None, None)
                .ok_or_else(|| "FFmpeg binary could not be resolved.".to_string())?;
            let finalized = crate::infrastructure::job_recovery::finalize_partial_video(target, &ffmpeg_bin)?;
            Ok(json!({
                "status": "ok",
                "message": "Partial video container finalized successfully.",
                "finalized_file": finalized.to_string_lossy()
            }))
        }
        "discard" => {
            let count = crate::infrastructure::job_recovery::discard_incomplete_job(target)?;
            Ok(json!({
                "status": "ok",
                "message": format!("Discarded {count} partial files and checkpoint artifacts.")
            }))
        }
        "resume" => {
            Ok(json!({
                "status": "ok",
                "message": "Resume planned",
                "output_path": output_path,
                "source": source
            }))
        }
        other => Err(format!("Unknown incomplete job action: {other}")),
    }
}

#[tauri::command]
pub fn ipc_get_comparison_frame(
    source: Option<String>,
    timestamp: Option<f64>,
    deinterlacer: Option<String>,
    denoise: Option<bool>,
    chroma_fix: Option<bool>,
) -> Value {
    let ts = timestamp.unwrap_or(5.0).max(0.0);
    let deint = deinterlacer.unwrap_or_else(|| "qtgmc".to_string());
    let do_denoise = denoise.unwrap_or(true);
    let do_chroma = chroma_fix.unwrap_or(true);
    let src = source.unwrap_or_default();

    let res = crate::viewmodels::api_restoration::extract_comparison_frame_unified(
        &src,
        ts,
        &deint,
        do_denoise,
        do_chroma,
        false,
        false,
    );

    serde_json::to_value(&res).unwrap_or_else(|_| json!({}))
}

// ============================================================================
// DESKTOP APP ENTRYPOINT
// ============================================================================

/// Initializes and starts the native desktop window using the OS WebView.
pub fn run_desktop_app() {
    // Start the local HTTP micro-server in background for REST/SSE endpoints and static UI assets
    std::thread::spawn(|| {
        let _ = crate::infrastructure::http_server::run_native_http_server(
            crate::models::constants::DEFAULT_API_HOST,
            crate::models::constants::DEFAULT_API_PORT,
            false, // do not open external browser when inside native desktop WebView window!
        );
    });

    // Small delay ensuring TCP listener is ready before WebView2 connects
    std::thread::sleep(std::time::Duration::from_millis(150));

    tauri::Builder::default()
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                std::process::exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            // System & Hardware
            ipc_assess_hardware,
            ipc_calculate_optimal_tile_size,
            ipc_get_ffmpeg_install_command,
            ipc_evaluate_lock_decision,
            ipc_parse_advanced_toml,
            ipc_resolve_tool_path,
            ipc_verify_binary_integrity,
            ipc_format_binary_name,
            ipc_check_ffmpeg_capability,
            ipc_parse_preferences,
            ipc_get_preferences,
            ipc_save_preferences,
            // Restoration & Pipeline
            ipc_get_preset_config,
            ipc_build_realesrgan_command,
            ipc_build_qtgmc_script_content,
            ipc_build_vspipe_cli_args,
            ipc_parse_chapters,
            ipc_format_vtt_subtitles,
            ipc_format_srt_subtitles,
            ipc_build_audio_extract_args,
            ipc_disambiguate_speech_language,
            ipc_resolve_final_output_path,
            ipc_plan_restoration_job,
            ipc_execute_restoration_job,
            // Ingest & Probing
            ipc_probe_media_file,
            ipc_parse_ffprobe_json,
            ipc_build_ffprobe_args,
            ipc_detect_connected_drives,
            ipc_generate_panasonic_chapters,
            ipc_score_frame_candidate,
            ipc_build_thumbnail_extract_args,
            ipc_seconds_to_timecode,
            ipc_get_part_path,
            ipc_is_valid_media_extension,
            // Capture & QC
            ipc_classify_video_frame,
            ipc_evaluate_preflight,
            ipc_compute_obs_auth_response,
            ipc_generate_qc_report,
            ipc_mul_to_db,
            ipc_db_to_mul,
            ipc_analyze_visual_frame,
            ipc_evaluate_capture_trigger,
            // Storage & Queue
            ipc_compute_sha256,
            ipc_order_queue,
            ipc_calculate_queue_stats,
            ipc_format_destination_key,
            ipc_generate_bagit_manifest,
            ipc_generate_premis_v3_xml,
            ipc_evaluate_321_compliance,
            ipc_build_oauth_auth_url,
            ipc_get_storage_config,
            ipc_save_storage_config,
            ipc_plan_chunk_upload,
            ipc_copy_storage_file,
            // Incomplete Jobs & Comparison
            ipc_get_incomplete_jobs,
            ipc_handle_incomplete_job,
            ipc_get_comparison_frame,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
