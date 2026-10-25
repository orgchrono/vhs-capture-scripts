//! Process Lifecycle, Preset Configuration & Execution Handlers (`api_restoration/lifecycle_handlers.rs`).

use serde_json::{json, Value};

use crate::infrastructure::app_context::AppContext;
use crate::infrastructure::security::is_safe_media_path;
use crate::infrastructure::toolchain::is_obs_installed;
use crate::models::presets::{PresetConfig, RestorationPreset};
use crate::viewmodels::api_support::{media_dirs, resolve_media_input};
use crate::viewmodels::api_types::{ApiRequest, ApiResponse};
use crate::viewmodels::job_request_vm::{build_restore_job_command, map_restoration_payload};

/// Unified restoration pipeline startup routine.
pub fn start_restoration_unified(payload: &Value, ctx: &AppContext) -> ApiResponse {
    if ctx.process.is_running() {
        return ApiResponse::error(400, "A process is already running. Wait for completion.");
    }

    let raw_input = payload
        .get("input")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if raw_input.is_empty() {
        return ApiResponse::error(400, "Missing required field 'input'");
    }

    let dirs = media_dirs();
    let input_path_str = match resolve_media_input(raw_input, &dirs) {
        Some(p) => p,
        None => raw_input.to_string(),
    };

    if !is_safe_media_path(&input_path_str, &dirs.roots()) {
        return ApiResponse::error(400, "Invalid or insecure file path.");
    }

    let default_output = dirs.restored.to_string_lossy().to_string();
    let mapped = map_restoration_payload(payload, &input_path_str, &default_output);

    let current_exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(e) => return ApiResponse::error(500, &format!("Failed to resolve current binary: {e}")),
    };

    let (program, args) = match build_restore_job_command(&current_exe, &mapped.request) {
        Ok(pair) => pair,
        Err(e) => return ApiResponse::error(500, &e),
    };

    match ctx.process.start(&program, &args) {
        Ok(()) => ApiResponse::ok(&json!({
            "status": "ok",
            "message": "Restoration pipeline started successfully."
        })),
        Err(e) => ApiResponse::error(500, &e),
    }
}

pub fn handle_run_pipeline(req: &ApiRequest, ctx: &AppContext) -> ApiResponse {
    let parsed = req.json_body();
    start_restoration_unified(&parsed, ctx)
}

pub fn handle_action(req: &ApiRequest, ctx: &AppContext) -> ApiResponse {
    let parsed = req.json_body();
    let action = parsed.get("action").and_then(Value::as_str).unwrap_or("");
    let params = parsed.get("params").cloned().unwrap_or_else(|| json!({}));

    match action {
        "start_restore" => start_restoration_unified(&params, ctx),
        "stop_process" | "abort_process" => handle_abort(ctx),
        "pause_process" => handle_pause(ctx),
        "resume_process" => handle_resume(ctx),
        "install_obs" => {
            if is_obs_installed() {
                ApiResponse::ok(&json!({
                    "status": "ok",
                    "message": "obs_already_installed"
                }))
            } else if ctx.process.is_running() {
                ApiResponse::error(400, "A process is already running. Wait for completion.")
            } else {
                let current_exe = match std::env::current_exe() {
                    Ok(exe) => exe,
                    Err(e) => return ApiResponse::error(500, &format!("Could not determine executable path: {e}")),
                };
                let args = vec!["setup-obs".to_string()];
                match ctx.process.start(&current_exe, &args) {
                    Ok(()) => ApiResponse::ok(&json!({
                        "status": "ok",
                        "message": "obs_install_started"
                    })),
                    Err(e) => ApiResponse::error(500, &e),
                }
            }
        }
        "install_vapoursynth" => super::qc_handlers::handle_install_qtgmc(ctx),
        "detect_whisper_language" => super::whisper_service::handle_detect_whisper_language(&params),
        "generate_subtitles" => super::whisper_service::handle_generate_subtitles(&params, ctx),
        _ => ApiResponse::error(400, "Unknown action."),
    }
}

pub fn handle_pause(ctx: &AppContext) -> ApiResponse {
    match ctx.process.pause() {
        Ok(msg) => ApiResponse::ok(&json!({
            "status": "ok",
            "message": msg
        })),
        Err(e) => ApiResponse::error(400, &e),
    }
}

pub fn handle_resume(ctx: &AppContext) -> ApiResponse {
    match ctx.process.resume() {
        Ok(msg) => ApiResponse::ok(&json!({
            "status": "ok",
            "message": msg
        })),
        Err(e) => ApiResponse::error(400, &e),
    }
}

pub fn handle_abort(ctx: &AppContext) -> ApiResponse {
    if ctx.process.terminate() {
        ApiResponse::ok(&json!({
            "status": "ok",
            "message": "Process and signal successfully aborted."
        }))
    } else {
        ApiResponse::error(400, "No process currently running.")
    }
}

pub fn handle_status(ctx: &AppContext) -> ApiResponse {
    let snapshot = ctx.process.snapshot();
    ApiResponse::ok(&json!({
        "active": snapshot.running,
        "is_paused": snapshot.paused
    }))
}

pub fn handle_preset_config(req: &ApiRequest) -> ApiResponse {
    let preset_name = req.query("preset").unwrap_or_else(|| "gold".to_string());

    let preset = match preset_name.to_ascii_lowercase().as_str() {
        "gold" => RestorationPreset::Gold,
        "speed" => RestorationPreset::Speed,
        "tbc_hold" | "tbchold" => RestorationPreset::TbcHold,
        "ai_master" | "aimaster" => RestorationPreset::AiMaster,
        "custom" => RestorationPreset::Custom,
        _ => RestorationPreset::Gold,
    };

    let cfg = PresetConfig::from_preset(preset);
    ApiResponse::ok(&json!({
        "preset": format!("{preset:?}").to_lowercase(),
        "crf": cfg.crf,
        "deinterlacer": format!("{:?}", cfg.deinterlacer).to_lowercase(),
        "target_1080p": true,
        "chroma_fix": cfg.chroma_fix,
        "denoise": cfg.denoise,
        "comb_filter": cfg.comb_filter,
        "overscan_blanking": cfg.overscan_blanking,
        "audio_treatment": cfg.audio_treatment,
        "dropout_clean": cfg.dropout_clean,
        "ai_audio_denoise": cfg.ai_audio_denoise,
        "ai_face_restore": cfg.ai_face_restore,
        "ai_rife_60fps": cfg.ai_rife_60fps,
        "ai_upscaler": cfg.ai_upscaler
    }))
}
