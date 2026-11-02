//! REST API Handlers for Raw Disk Imaging and Forensic Carving.

use std::path::Path;
use serde_json::json;

use crate::infrastructure::app_context::AppContext;
use crate::infrastructure::panasonic::extractor::execute_panasonic_extraction;
use crate::infrastructure::security::is_safe_ingest_path;
use crate::viewmodels::api_support::media_dirs;
use crate::viewmodels::api_types::{ApiRequest, ApiResponse};

pub fn handle_disk_image_drives() -> ApiResponse {
    let drives = crate::viewmodels::ingest_vm::ipc_list_physical_drives();
    let total = drives.len();
    ApiResponse::ok(&json!({
        "drives": drives,
        "total": total
    }))
}

pub fn handle_disk_image_start(req: &ApiRequest, ctx: &AppContext) -> ApiResponse {
    if ctx.process.is_running() {
        return ApiResponse::error(409, "Another restoration or imaging pipeline is currently running.");
    }

    let config: crate::domain::disk_imager::ImagingConfig = match serde_json::from_str(&req.body_json) {
        Ok(c) => c,
        Err(e) => return ApiResponse::error(400, &format!("Invalid JSON imaging config: {e}")),
    };

    let dirs = media_dirs();
    if !is_safe_ingest_path(&config.source_device_id, &dirs.roots()) {
        return ApiResponse::error(400, "Invalid or unsafe source device path.");
    }

    let out_dir = Path::new(&config.output_image_path)
        .parent()
        .unwrap_or_else(|| Path::new(""));
    let out_dir_str = out_dir.to_string_lossy();
    if !out_dir_str.is_empty() && !is_safe_ingest_path(&out_dir_str, &dirs.roots()) {
        return ApiResponse::error(400, "Invalid or unsafe output directory path.");
    }

    let report_res = crate::infrastructure::disk_imager::run_disk_imaging_job(ctx, &config, None, None);
    match report_res {
        Ok(report) => {
            let mut carved_files: Vec<String> = Vec::new();
            if config.auto_chain_restoration {
                let default_raw = dirs.raw.to_string_lossy().to_string();
                if let Ok(files) = execute_panasonic_extraction(&config.output_image_path, &default_raw, None) {
                    carved_files = files;
                }
            }
            ApiResponse::ok(&json!({
                "status": "success",
                "message": "Raw disk image created successfully.",
                "report": report,
                "carved_files": carved_files
            }))
        }
        Err(e) => ApiResponse::error(500, &e),
    }
}

pub fn handle_disk_image_cancel(ctx: &AppContext) -> ApiResponse {
    let cancelled = ctx.process.terminate();
    ApiResponse::ok(&json!({
        "status": "ok",
        "cancelled": cancelled,
        "message": "Disk imaging operation cancelled."
    }))
}
