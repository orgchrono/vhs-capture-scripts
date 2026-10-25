//! Quality Control & QTGMC Toolchain Handlers (`api_restoration/qc_handlers.rs`).

use std::fs;
use std::path::Path;
use serde_json::{json, Value};

use crate::infrastructure::app_context::AppContext;
use crate::infrastructure::security::is_safe_media_path;
use crate::infrastructure::toolchain::{is_vapoursynth_available, resolve_executable_path};
use crate::viewmodels::api_support::{media_dirs, resolve_media_input};
use crate::viewmodels::api_types::{ApiRequest, ApiResponse};

pub fn handle_qc_report(req: &ApiRequest) -> ApiResponse {
    let file_path = req.query("file_path").unwrap_or_default();

    if file_path.is_empty() {
        return ApiResponse::error(400, "Missing required query parameter 'file_path'");
    }

    let dirs = media_dirs();
    let target = resolve_media_input(&file_path, &dirs).unwrap_or(file_path);
    if !is_safe_media_path(&target, &dirs.roots()) {
        return ApiResponse::error(400, "Invalid or unsafe file path.");
    }

    let json_path = format!("{target}_qc_report.json");
    let md_path = format!("{target}_defect_report.md");

    // Also check stem-based paths (e.g. without extension)
    let stem_path = target.rsplit_once('.').map(|(s, _)| s).unwrap_or(&target);
    let stem_json = format!("{stem_path}_qc_report.json");
    let stem_md = format!("{stem_path}_defect_report.md");

    let resolved_json = if Path::new(&json_path).is_file() {
        Some(json_path.clone())
    } else if Path::new(&stem_json).is_file() {
        Some(stem_json)
    } else {
        None
    };

    let resolved_md = if Path::new(&md_path).is_file() {
        Some(md_path.clone())
    } else if Path::new(&stem_md).is_file() {
        Some(stem_md)
    } else {
        None
    };

    let raw_file_stem = Path::new(&target)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    let (cand_restored_json, cand_restored_md) = if resolved_json.is_none() && !raw_file_stem.is_empty() {
        let mut r_json = None;
        let mut r_md = None;
        if let Ok(entries) = fs::read_dir(&dirs.restored) {
            for entry in entries.flatten() {
                let p = entry.path();
                let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or_default();
                if fname.starts_with(raw_file_stem) && fname.ends_with("_qc_report.json") {
                    r_json = Some(p.to_string_lossy().to_string());
                    let cand_md = p.with_file_name(fname.replace("_qc_report.json", "_defect_report.md"));
                    if cand_md.is_file() {
                        r_md = Some(cand_md.to_string_lossy().to_string());
                    }
                    break;
                }
            }
        }
        (r_json, r_md)
    } else {
        (None, None)
    };

    let final_json = resolved_json.or(cand_restored_json);
    let final_md = resolved_md.or(cand_restored_md);

    if let Some(j_path) = final_json {
        let report_content = fs::read_to_string(&j_path).unwrap_or_default();
        let report_data: Value = serde_json::from_str(&report_content).unwrap_or_else(|_| json!({}));
        let md_text = final_md
            .and_then(|m| fs::read_to_string(m).ok())
            .unwrap_or_default();

        return ApiResponse::ok(&json!({
            "exists": true,
            "report_json_path": j_path,
            "report_md_path": md_path,
            "report": report_data,
            "markdown": md_text
        }));
    }

    // Dynamic fallback generation if target media file exists on disk
    let p_target = Path::new(&target);
    if p_target.is_file() {
        let ffprobe_bin = resolve_executable_path("ffprobe", None, None)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "ffprobe".to_string());
        let ffmpeg_bin = resolve_executable_path("ffmpeg", None, None)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "ffmpeg".to_string());

        if let Ok(assessment) = crate::infrastructure::probe::assess_media_file_qc(&target, &ffprobe_bin, &ffmpeg_bin) {
            let md = crate::domain::qc::generate_qc_markdown_report(&assessment);
            let report_val = serde_json::to_value(&assessment).unwrap_or_else(|_| json!({}));

            // Persist for subsequent requests
            let _ = fs::write(&json_path, serde_json::to_string_pretty(&report_val).unwrap_or_default());
            let _ = fs::write(&md_path, &md);

            return ApiResponse::ok(&json!({
                "exists": true,
                "report_json_path": json_path,
                "report_md_path": md_path,
                "report": report_val,
                "markdown": md
            }));
        }
    }

    ApiResponse::ok(&json!({
        "exists": false,
        "report": null,
        "markdown": ""
    }))
}

pub fn handle_install_qtgmc(ctx: &AppContext) -> ApiResponse {
    if is_vapoursynth_available() {
        return ApiResponse::ok(&json!({
            "status": "ok",
            "message": "vapoursynth_already_available"
        }));
    }
    if ctx.process.is_running() {
        return ApiResponse::error(400, "A process is already running. Wait for completion.");
    }

    let current_exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(e) => return ApiResponse::error(500, &format!("Could not determine executable path: {e}")),
    };

    let args = vec!["setup-qtgmc".to_string()];
    match ctx.process.start(&current_exe, &args) {
        Ok(()) => ApiResponse::ok(&json!({
            "status": "ok",
            "message": "vapoursynth_install_started"
        })),
        Err(e) => ApiResponse::error(500, &e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_handle_qc_report_execution() {
        let req = ApiRequest {
            method: "GET".to_string(),
            path: "/api/restoration/qc-report?file_path=media%2Fraw%2F2026-10-02%2013-48-53.mkv".to_string(),
            body_json: String::new(),
        };
        let res = handle_qc_report(&req);
        assert_eq!(res.status_code, 200);

        let abs_path = std::env::current_dir()
            .unwrap()
            .join("media")
            .join("raw")
            .join("2026-10-02 13-48-53.mkv")
            .to_string_lossy()
            .to_string();
        let encoded_abs = abs_path.replace(' ', "%20").replace('\\', "%5C").replace(':', "%3A");
        let req_abs = ApiRequest {
            method: "GET".to_string(),
            path: format!("/api/restoration/qc-report?file_path={encoded_abs}"),
            body_json: String::new(),
        };
        let res_abs = handle_qc_report(&req_abs);
        assert_eq!(res_abs.status_code, 200);
    }
}

