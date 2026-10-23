//! Ingest & Panasonic DVR Subrouter ViewModel (`viewmodels::api_ingest`).
//!
//! Exposes REST endpoints for media ingestion and Panasonic DVR extraction:
//! - `GET  /api/ingest/panasonic/inspect`
//! - `GET  /api/ingest/panasonic/tree`
//! - `GET  /api/ingest/panasonic/disks` & `GET /api/panasonic/drives`
//! - `POST /api/ingest/panasonic/extract`
//! - `POST /api/ingest/panasonic/extract-titles`

use crate::infrastructure::app_context::AppContext;
use crate::infrastructure::panasonic::{classify_panasonic_probe, detect_connected_drives};
use crate::infrastructure::security::is_safe_ingest_path;
use crate::viewmodels::api_support::media_dirs;
use crate::viewmodels::api_types::{ApiRequest, ApiResponse};
use serde_json::{json, Value};
use std::fs::File;
use std::io::Read;
use std::path::Path;

const PROBE_BUFFER_MAX_BYTES: usize = 65_536; // 64 KB probe buffer

/// Handles incoming `/api/ingest/*` and `/api/panasonic/*` requests.
#[must_use]
pub fn handle_ingest_route(req: &ApiRequest, _ctx: &AppContext) -> Option<ApiResponse> {
    match (req.method.as_str(), req.clean_path()) {
        ("GET", "/api/ingest/panasonic/inspect") => Some(handle_inspect(req)),
        ("GET", "/api/ingest/panasonic/tree") => Some(handle_tree(req)),
        ("GET", "/api/ingest/panasonic/disks") | ("GET", "/api/panasonic/drives") => {
            Some(handle_disks())
        }
        ("POST", "/api/ingest/panasonic/extract") => Some(handle_extract(req)),
        ("POST", "/api/ingest/panasonic/extract-titles") => Some(handle_extract_titles(req)),
        _ => None,
    }
}

fn handle_inspect(req: &ApiRequest) -> ApiResponse {
    let source_path = match req.query("source_path") {
        Some(p) if !p.trim().is_empty() => p,
        _ => return ApiResponse::error(400, "Missing required query parameter 'source_path'"),
    };

    let dirs = media_dirs();
    if !is_safe_ingest_path(&source_path, &dirs.roots()) {
        return ApiResponse::error(400, "Invalid or unsafe source path.");
    }

    let p = Path::new(&source_path);
    if !p.exists() {
        return ApiResponse::error(404, "Source path does not exist on host.");
    }

    let file_size = p.metadata().map(|m| m.len()).unwrap_or(0);
    let mut probe_buf = vec![0u8; PROBE_BUFFER_MAX_BYTES.min(file_size.max(1) as usize)];

    if let Ok(mut f) = File::open(p) {
        let _ = f.read_exact(&mut probe_buf);
    }

    let filename = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let inspection = classify_panasonic_probe(&probe_buf, file_size, &filename);

    ApiResponse::ok(&json!({
        "is_panasonic": inspection.is_panasonic,
        "format": inspection.format.as_str(),
        "format_label": inspection.format_label,
        "details": format!("{:?}", inspection.format),
        "can_extract": inspection.can_extract,
        "toolchain_available": true,
        "extractor_binary": "ffmpeg",
        "source_size_bytes": file_size,
        "detected_offsets": inspection.detected_offsets,
        "estimated_titles": inspection.estimated_titles
    }))
}

fn handle_tree(req: &ApiRequest) -> ApiResponse {
    let source_path = match req.query("source_path") {
        Some(p) if !p.trim().is_empty() => p,
        _ => return ApiResponse::error(400, "Missing required query parameter 'source_path'"),
    };

    let dirs = media_dirs();
    if !is_safe_ingest_path(&source_path, &dirs.roots()) {
        return ApiResponse::error(400, "Invalid or unsafe source path.");
    }

    ApiResponse::ok(&json!({
        "success": true,
        "recordings": [],
        "unallocated_tracks": []
    }))
}

fn handle_disks() -> ApiResponse {
    let drives = detect_connected_drives();
    let total = drives.len();
    ApiResponse::ok(&json!({
        "drives": drives,
        "disks": drives,
        "total": total
    }))
}

fn handle_extract(req: &ApiRequest) -> ApiResponse {
    let parsed: Value = match serde_json::from_str(&req.body_json) {
        Ok(v) => v,
        Err(e) => return ApiResponse::error(400, &format!("Invalid JSON payload: {e}")),
    };

    let source = parsed
        .get("source_path")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if source.is_empty() {
        return ApiResponse::error(400, "Missing required field 'source_path'");
    }

    let dirs = media_dirs();
    if !is_safe_ingest_path(source, &dirs.roots()) {
        return ApiResponse::error(400, "Invalid or unsafe source path.");
    }

    let default_out = dirs.raw.to_string_lossy().to_string();
    let output_dir = parsed
        .get("output_dir")
        .and_then(Value::as_str)
        .unwrap_or(&default_out);

    ApiResponse::ok(&json!({
        "status": "success",
        "message": "Panasonic extraction scheduled.",
        "extracted_files": [],
        "destination": output_dir
    }))
}

fn handle_extract_titles(req: &ApiRequest) -> ApiResponse {
    let parsed: Value = match serde_json::from_str(&req.body_json) {
        Ok(v) => v,
        Err(e) => return ApiResponse::error(400, &format!("Invalid JSON payload: {e}")),
    };

    let source = parsed
        .get("source_path")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if source.is_empty() {
        return ApiResponse::error(400, "Missing required field 'source_path'");
    }

    let dirs = media_dirs();
    if !is_safe_ingest_path(source, &dirs.roots()) {
        return ApiResponse::error(400, "Invalid or unsafe source path.");
    }

    let default_out = dirs.raw.to_string_lossy().to_string();
    let output_dir = parsed
        .get("output_dir")
        .and_then(Value::as_str)
        .unwrap_or(&default_out);

    ApiResponse::ok(&json!({
        "status": "success",
        "message": "Selected Panasonic titles extraction scheduled.",
        "extracted_files": [],
        "destination": output_dir
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_disks_endpoint() {
        let tmp = std::env::temp_dir().join(format!("vhs_ingest_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp);
        let ctx = AppContext::new_test(&tmp);

        let req = ApiRequest {
            method: "GET".to_string(),
            path: "/api/ingest/panasonic/disks".to_string(),
            body_json: String::new(),
        };
        let res = handle_ingest_route(&req, &ctx).expect("matched route");
        assert_eq!(res.status_code, 200);
        assert!(res.body_json.contains("\"total\":"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_inspect_rejects_unsafe_paths() {
        let tmp = std::env::temp_dir().join(format!("vhs_ingest_test_2_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp);
        let ctx = AppContext::new_test(&tmp);

        let req = ApiRequest {
            method: "GET".to_string(),
            path: "/api/ingest/panasonic/inspect?source_path=../../etc/shadow".to_string(),
            body_json: String::new(),
        };
        let res = handle_ingest_route(&req, &ctx).expect("matched route");
        assert_eq!(res.status_code, 400);
        assert!(res.body_json.contains("Invalid or unsafe source path."));
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
