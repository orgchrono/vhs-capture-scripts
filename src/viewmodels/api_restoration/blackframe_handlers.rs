//! REST API handlers for fast Blackframe & TBC Frame-Hold hygiene (`api_restoration/blackframe_handlers.rs`).
//!
//! Provides `POST /api/restoration/blackframe-clean` to scan, merge gaps, and clean
//! leaders/trailers or freeze dropouts directly on media files with automatic lineage sidecar persistence.

use std::path::Path;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::domain::blackframe::{
    build_blackdetect_cli_args, build_blackframe_clean_ffmpeg_args, classify_black_regions,
    merge_black_intervals, parse_blackdetect_stderr, BlackframeCleanMode,
};
use crate::infrastructure::app_context::AppContext;
use crate::infrastructure::probe::probe_media_file;
use crate::infrastructure::toolchain::{create_silent_command, resolve_executable_path};
use crate::models::constants::{
    BLACK_MERGE_MAX_GAP_SEC, MEDIA_MANIFEST_SCHEMA_VERSION, STAGE_3_BLACKFRAME_TRIM,
};
use crate::models::manifest::{
    compute_available_stages, load_manifest_sidecar, save_manifest_sidecar, ManifestStageEvent,
    MediaManifest,
};
use crate::viewmodels::api_types::{ApiRequest, ApiResponse};

/// Request payload for `POST /api/restoration/blackframe-clean`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BlackframeCleanApiRequest {
    pub input_path: String,
    pub output_path: Option<String>,
    pub mode: Option<BlackframeCleanMode>,
}

/// Resolves default output path for cleaned media when none is explicitly provided.
#[must_use]
pub fn resolve_cleaned_output_path(input_path: &str) -> String {
    let p = Path::new(input_path);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("media");
    let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("mp4");
    let parent = p.parent().unwrap_or_else(|| Path::new("."));
    parent
        .join(format!("{stem}_cleaned.{ext}"))
        .to_string_lossy()
        .to_string()
}

/// Handles `POST /api/restoration/blackframe-clean`.
pub fn handle_blackframe_clean(req: &ApiRequest, _ctx: &AppContext) -> ApiResponse {
    let payload: BlackframeCleanApiRequest = match serde_json::from_str(&req.body_json) {
        Ok(p) => p,
        Err(e) => return ApiResponse::error(400, &format!("Invalid request JSON: {e}")),
    };

    let input_path = payload.input_path.trim().to_string();
    if input_path.is_empty() || !Path::new(&input_path).is_file() {
        return ApiResponse::error(404, "Input media file not found on disk");
    }

    let cwd = std::env::current_dir().ok();
    let home_str = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).ok();
    let home = home_str.as_ref().map(Path::new);

    let ffmpeg_bin = resolve_executable_path("ffmpeg", cwd.as_deref(), home)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "ffmpeg".to_string());

    let ffprobe_bin = resolve_executable_path("ffprobe", cwd.as_deref(), home)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "ffprobe".to_string());

    let probe = match probe_media_file(&input_path, &ffprobe_bin) {
        Ok(p) => p,
        Err(e) => return ApiResponse::error(422, &format!("Failed to probe media file: {e}")),
    };

    let detect_args = build_blackdetect_cli_args(&input_path);
    if detect_args.is_empty() {
        return ApiResponse::error(500, "Failed to construct blackdetect CLI arguments");
    }

    let mut cmd = create_silent_command(Path::new(&ffmpeg_bin));
    cmd.args(&detect_args);

    let output = match cmd.output() {
        Ok(out) => out,
        Err(e) => return ApiResponse::error(500, &format!("Failed to execute blackdetect pass: {e}")),
    };

    let stderr_str = String::from_utf8_lossy(&output.stderr);
    let raw_intervals = parse_blackdetect_stderr(&stderr_str);
    let merged_intervals = merge_black_intervals(&raw_intervals, BLACK_MERGE_MAX_GAP_SEC);
    let classification = classify_black_regions(&merged_intervals, probe.duration);

    if classification.is_fully_black {
        return ApiResponse::error(
            422,
            "Video stream appears to be 100% black; trimming would result in empty media",
        );
    }

    let mode = payload.mode.unwrap_or(BlackframeCleanMode::Auto);
    let out_path = payload
        .output_path
        .unwrap_or_else(|| resolve_cleaned_output_path(&input_path));

    let clean_args_opt = build_blackframe_clean_ffmpeg_args(
        &input_path,
        &out_path,
        &classification,
        mode,
    );

    let clean_args = match clean_args_opt {
        Some(args) => args,
        None => {
            return ApiResponse::ok(&json!({
                "success": true,
                "input_path": input_path,
                "output_path": input_path,
                "classification": classification,
                "cleaned": false,
                "message": "No black regions detected or mode requirements met; file is already pristine",
            }));
        }
    };

    let mut clean_cmd = create_silent_command(Path::new(&ffmpeg_bin));
    clean_cmd.args(&clean_args);

    let clean_res = match clean_cmd.output() {
        Ok(out) => out,
        Err(e) => return ApiResponse::error(500, &format!("Failed to execute blackframe clean: {e}")),
    };

    if !clean_res.status.success() {
        let err_tail = String::from_utf8_lossy(&clean_res.stderr);
        let sample = if err_tail.len() > 1024 {
            &err_tail[err_tail.len() - 1024..]
        } else {
            &err_tail
        };
        return ApiResponse::error(500, &format!("FFmpeg clean execution failed: {sample}"));
    }

    // Persist lineage update in companion .manifest.json
    let now = crate::models::timestamp::now_iso8601();
    let existing_manifest = load_manifest_sidecar(Path::new(&input_path));
    let mut completed_stages = existing_manifest
        .as_ref()
        .map(|m| m.completed_stages.clone())
        .unwrap_or_default();

    if !completed_stages.iter().any(|s| s == STAGE_3_BLACKFRAME_TRIM) {
        completed_stages.push(STAGE_3_BLACKFRAME_TRIM.to_string());
    }
    completed_stages.sort();
    completed_stages.dedup();

    let is_progressive = existing_manifest.as_ref().map_or(!probe.is_interlaced, |m| m.is_progressive);
    let available_stages = compute_available_stages(is_progressive, &completed_stages);

    let mut history = existing_manifest
        .as_ref()
        .map(|m| m.history.clone())
        .unwrap_or_default();

    history.push(ManifestStageEvent {
        stage: STAGE_3_BLACKFRAME_TRIM.to_string(),
        timestamp: now.clone(),
        params: json!({
            "mode": format!("{mode:?}"),
            "leader_start_sec": classification.leader.as_ref().map(|l| l.start_sec),
            "leader_end_sec": classification.leader.as_ref().map(|l| l.end_sec),
            "trailer_start_sec": classification.trailer.as_ref().map(|t| t.start_sec),
            "mid_gaps_count": classification.mid_gaps.len(),
        }),
    });

    let manifest = MediaManifest {
        version: MEDIA_MANIFEST_SCHEMA_VERSION,
        file_path: out_path.clone(),
        source_raw: existing_manifest
            .as_ref()
            .map(|m| m.source_raw.clone())
            .unwrap_or_else(|| input_path.clone()),
        source_raw_sha256: existing_manifest.as_ref().and_then(|m| m.source_raw_sha256.clone()),
        created_at: now,
        is_progressive,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        completed_stages,
        available_stages,
        history,
    };

    let _ = save_manifest_sidecar(Path::new(&out_path), &manifest);

    ApiResponse::ok(&json!({
        "success": true,
        "input_path": input_path,
        "output_path": out_path,
        "classification": classification,
        "cleaned": true,
        "message": "Blackframe hygiene executed successfully",
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_cleaned_output_path() {
        assert_eq!(
            resolve_cleaned_output_path("media/raw/tape_01.mkv").replace('\\', "/"),
            "media/raw/tape_01_cleaned.mkv"
        );
        assert_eq!(
            resolve_cleaned_output_path("C:/videos/family.mp4").replace('\\', "/"),
            "C:/videos/family_cleaned.mp4"
        );
    }

    #[test]
    fn test_handle_blackframe_clean_nonexistent_file() {
        let tmp = std::env::temp_dir();
        let ctx = AppContext::new_test(&tmp);
        let req = ApiRequest {
            method: "POST".to_string(),
            path: "/api/restoration/blackframe-clean".to_string(),
            body_json: json!({ "input_path": "nonexistent_file_xyz.mp4" }).to_string(),
        };
        let res = handle_blackframe_clean(&req, &ctx);
        assert_eq!(res.status_code, 404);
        assert!(res.body_json.contains("Input media file not found"));
    }
}
