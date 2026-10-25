//! Checkpoint & Incomplete Job API Handlers (`api_restoration/checkpoint_handlers.rs`).

use std::fs;
use std::path::{Path, PathBuf};
use serde_json::json;

use crate::domain::recovery::CheckpointData;
use crate::infrastructure::app_context::AppContext;
use crate::infrastructure::job_recovery::{
    check_existing_restoration, discard_incomplete_job, finalize_partial_video,
    scan_incomplete_jobs,
};
use crate::infrastructure::toolchain::resolve_executable_path;
use crate::models::recovery::IncompleteJobActionPayload;
use crate::viewmodels::api_support::{media_dirs, resolve_media_input};
use crate::viewmodels::api_types::{ApiRequest, ApiResponse};
use crate::viewmodels::job_request_vm::{build_restore_job_command, map_restoration_payload};

pub fn handle_check_existing(req: &ApiRequest) -> ApiResponse {
    let source = req.query("source").unwrap_or_default();

    if source.is_empty() {
        return ApiResponse::ok(&json!({ "has_existing": false }));
    }

    let dirs = media_dirs();
    let resolved_source = match resolve_media_input(&source, &dirs) {
        Some(s) => s,
        None => source,
    };

    let search_dirs = [dirs.restored.clone(), dirs.work.clone()];
    let raw_dirs = [dirs.raw.clone(), dirs.media.clone()];
    let check = check_existing_restoration(
        Path::new(&resolved_source),
        &search_dirs,
        &raw_dirs,
        &dirs.restored,
    );

    let check_val =
        serde_json::to_value(&check).unwrap_or_else(|_| json!({ "has_existing": false }));
    ApiResponse::ok(&check_val)
}

pub fn handle_incomplete_list() -> ApiResponse {
    let dirs = media_dirs();
    let search_dirs = [dirs.restored.clone(), dirs.work.clone()];
    let raw_dirs = [dirs.raw.clone(), dirs.media.clone()];
    let jobs = scan_incomplete_jobs(&search_dirs, &raw_dirs);
    let total = jobs.len();

    ApiResponse::ok(&json!({
        "incomplete_jobs": jobs,
        "total": total
    }))
}

pub fn handle_incomplete_action(req: &ApiRequest, ctx: &AppContext) -> ApiResponse {
    let payload: IncompleteJobActionPayload = match serde_json::from_str(&req.body_json) {
        Ok(p) => p,
        Err(e) => return ApiResponse::error(400, &format!("Invalid incomplete job action payload: {e}")),
    };

    let dirs = media_dirs();
    let target_path = Path::new(&payload.output_path);

    match payload.action.to_ascii_lowercase().as_str() {
        "finalize" => {
            let ffmpeg_bin = match resolve_executable_path("ffmpeg", None, None) {
                Some(bin) => bin,
                None => return ApiResponse::error(500, "FFmpeg binary could not be resolved."),
            };

            match finalize_partial_video(target_path, Path::new(&ffmpeg_bin)) {
                Ok(finalized) => ApiResponse::ok(&json!({
                    "status": "ok",
                    "message": "Partial video container finalized successfully.",
                    "finalized_file": finalized.to_string_lossy()
                })),
                Err(e) => ApiResponse::error(500, &e),
            }
        }
        "discard" => {
            match discard_incomplete_job(target_path) {
                Ok(count) => ApiResponse::ok(&json!({
                    "status": "ok",
                    "message": format!("Discarded {count} partial files and checkpoint artifacts.")
                })),
                Err(e) => ApiResponse::error(500, &e),
            }
        }
        "resume" => {
            if ctx.process.is_running() {
                return ApiResponse::error(400, "A restoration process is already running. Wait for completion.");
            }

            let source_str = payload.source.unwrap_or_default();
            let clean_base = payload.output_path.strip_suffix(".part").unwrap_or(&payload.output_path);
            let chk_cand = PathBuf::from(format!("{clean_base}.checkpoint.json"));
            let mut checkpoint_opt: Option<CheckpointData> = None;
            if chk_cand.is_file() {
                if let Ok(content) = fs::read_to_string(&chk_cand) {
                    if let Ok(data) = serde_json::from_str::<CheckpointData>(&content) {
                        checkpoint_opt = Some(data);
                    }
                }
            }

            let mut resolved_source = if !source_str.is_empty() {
                resolve_media_input(&source_str, &dirs).unwrap_or(source_str)
            } else {
                String::new()
            };

            if resolved_source.is_empty() {
                if let Some(ref data) = checkpoint_opt {
                    if let Some(ref src) = data.source {
                        resolved_source = resolve_media_input(src, &dirs).unwrap_or_else(|| src.clone());
                    }
                }
            }

            if resolved_source.is_empty() || !Path::new(&resolved_source).exists() {
                return ApiResponse::error(400, "Cannot resume: source tape file does not exist on disk.");
            }

            let ffprobe_bin = crate::infrastructure::toolchain::resolve_executable_path("ffprobe", None, None)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "ffprobe".to_string());

            let mut resume_start_sec = 0.0;
            let mut orig_job_req: Option<crate::infrastructure::executor::RestorationJobRequest> = None;
            if let Some(ref data) = checkpoint_opt {
                if let Some(ref rj) = data.request_json {
                    if let Ok(deserialized) = serde_json::from_str::<crate::infrastructure::executor::RestorationJobRequest>(rj) {
                        orig_job_req = Some(deserialized);
                    }
                }
                let kept = data.kept_frames.unwrap_or(0);
                let total_expected = data.total_expected_frames.unwrap_or(0);
                if kept > 0 {
                    if let Ok(probe) = crate::infrastructure::probe::probe_media_file(&resolved_source, &ffprobe_bin) {
                        let segment_duration = orig_job_req.as_ref().and_then(|r| r.duration_sec).unwrap_or(probe.duration);
                        let is_double_rate = orig_job_req.as_ref().map(|r| {
                            matches!(
                                r.custom_deinterlacer,
                                Some(
                                    crate::domain::pipeline::DeinterlaceFilter::Qtgmc
                                    | crate::domain::pipeline::DeinterlaceFilter::BwdifBob
                                    | crate::domain::pipeline::DeinterlaceFilter::Znedi3
                                    | crate::domain::pipeline::DeinterlaceFilter::Nnedi3
                                    | crate::domain::pipeline::DeinterlaceFilter::Yadif
                                )
                            )
                            || r.preset == crate::models::presets::RestorationPreset::Gold
                            || r.preset == crate::models::presets::RestorationPreset::AiMaster
                            || r.preset == crate::models::presets::RestorationPreset::TbcHold
                        }).unwrap_or(true);
                        let effective_fps = if is_double_rate { probe.fps * 2.0 } else { probe.fps };

                        let elapsed_job_sec = if total_expected > 0 && segment_duration > 0.0 {
                            ((kept as f64 / total_expected as f64) * segment_duration).min(segment_duration)
                        } else if effective_fps > 0.0 {
                            (kept as f64 / effective_fps).min(segment_duration)
                        } else {
                            0.0
                        };

                        let orig_base = orig_job_req
                            .as_ref()
                            .and_then(|r| r.base_start_sec)
                            .or_else(|| orig_job_req.as_ref().map(|r| r.start_sec))
                            .unwrap_or(0.0);
                        resume_start_sec = (orig_base + elapsed_job_sec).clamp(0.0, probe.duration);
                    }
                }
            }

            let default_output = dirs.restored.to_string_lossy().to_string();
            let final_request = if let Some(mut req) = orig_job_req {
                let orig_base = req.base_start_sec.unwrap_or(req.start_sec);
                req.base_start_sec = Some(orig_base);
                let elapsed_job_sec = (resume_start_sec - orig_base).max(0.0);
                req.start_sec = resume_start_sec;
                if let Some(orig_dur) = req.duration_sec {
                    req.duration_sec = Some((orig_dur - elapsed_job_sec).max(0.0));
                }
                req
            } else {
                let resume_payload = json!({
                    "input": resolved_source,
                    "output": payload.output_path,
                    "start_sec": resume_start_sec,
                    "start": resume_start_sec,
                    "base_start_sec": 0.0
                });
                map_restoration_payload(&resume_payload, &resolved_source, &default_output).request
            };

            let current_exe = match std::env::current_exe() {
                Ok(exe) => exe,
                Err(e) => return ApiResponse::error(500, &format!("Failed to resolve current binary: {e}")),
            };

            let (program, args) = match build_restore_job_command(&current_exe, &final_request) {
                Ok(pair) => pair,
                Err(e) => return ApiResponse::error(500, &e),
            };

            match ctx.process.start(&program, &args) {
                Ok(()) => ApiResponse::ok(&json!({
                    "status": "ok",
                    "message": "Resumed restoration pipeline successfully."
                })),
                Err(e) => ApiResponse::error(500, &e),
            }
        }
        other => ApiResponse::error(400, &format!("Unknown recovery action: '{other}'")),
    }
}
