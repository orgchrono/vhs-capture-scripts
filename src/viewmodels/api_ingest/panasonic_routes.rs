//! REST API Handlers for Panasonic DVR Drive and Title Ingest.

use std::path::{Path, PathBuf};
use serde_json::{json, Value};

use crate::infrastructure::app_context::AppContext;
use crate::infrastructure::panasonic::{
    detect_connected_drives, generate_panasonic_chapters, inspect_panasonic_file,
    PanasonicFilesystemFormat, PanasonicInspection, PANASONIC_CHAPTER_INTERVAL_SEC,
    PANASONIC_DEFAULT_TITLE_DURATION_SEC,
};
use crate::infrastructure::panasonic::extractor::{execute_panasonic_extraction, is_valid_ingest_source};
use crate::infrastructure::security::is_safe_ingest_path;
use crate::infrastructure::toolchain::resolve_executable_path;
use crate::viewmodels::api_support::media_dirs;
use crate::viewmodels::api_types::{ApiRequest, ApiResponse};

pub fn handle_inspect(req: &ApiRequest) -> ApiResponse {
    let source_path = match req.query("source_path") {
        Some(p) if !p.trim().is_empty() => p,
        _ => return ApiResponse::error(400, "Missing required query parameter 'source_path'"),
    };

    let dirs = media_dirs();
    if !is_safe_ingest_path(&source_path, &dirs.roots()) {
        return ApiResponse::error(400, "Invalid or unsafe source path.");
    }

    let p = Path::new(&source_path);
    if !is_valid_ingest_source(p) {
        return ApiResponse::error(404, "Source path does not exist on host.");
    }

    let (inspection, file_size) = match inspect_panasonic_file(p) {
        Ok(res) => res,
        Err(err) => return ApiResponse::error(500, &err),
    };

    let has_meihdfs = resolve_executable_path("extract_meihdfs", None, None).is_some();
    let has_dvd_vr = resolve_executable_path("dvd-vr", None, None).is_some();
    let has_ffmpeg = resolve_executable_path("ffmpeg", None, None).is_some();
    let toolchain_available = has_meihdfs || has_dvd_vr || has_ffmpeg;

    let extractor_binary = if inspection.format == PanasonicFilesystemFormat::DvdVr {
        resolve_executable_path("dvd-vr", None, None)
            .or_else(|| resolve_executable_path("ffmpeg", None, None))
    } else {
        resolve_executable_path("extract_meihdfs", None, None)
            .or_else(|| resolve_executable_path("ffmpeg", None, None))
    }
    .unwrap_or_else(|| PathBuf::from("ffmpeg"));

    ApiResponse::ok(&json!({
        "is_panasonic": inspection.is_panasonic,
        "format": inspection.format.as_str(),
        "format_label": inspection.format_label,
        "details": format!("{:?}", inspection.format),
        "can_extract": inspection.can_extract,
        "toolchain_available": toolchain_available,
        "extractor_binary": extractor_binary.to_string_lossy(),
        "source_size_bytes": file_size,
        "detected_offsets": inspection.detected_offsets,
        "estimated_titles": inspection.estimated_titles
    }))
}

pub fn handle_tree(req: &ApiRequest) -> ApiResponse {
    let source_path = match req.query("source_path") {
        Some(p) if !p.trim().is_empty() => p,
        _ => return ApiResponse::error(400, "Missing required query parameter 'source_path'"),
    };

    let dirs = media_dirs();
    if !is_safe_ingest_path(&source_path, &dirs.roots()) {
        return ApiResponse::error(400, "Invalid or unsafe source path.");
    }

    let p = Path::new(&source_path);
    let (inspection, file_size) = if is_valid_ingest_source(p) {
        inspect_panasonic_file(p).unwrap_or_else(|_| {
            (
                PanasonicInspection {
                    is_panasonic: false,
                    format: PanasonicFilesystemFormat::Unknown,
                    format_label: "UNKNOWN".to_string(),
                    can_extract: false,
                    detected_offsets: vec![],
                    estimated_titles: 0,
                },
                0,
            )
        })
    } else {
        (
            PanasonicInspection {
                is_panasonic: false,
                format: PanasonicFilesystemFormat::Unknown,
                format_label: "UNKNOWN".to_string(),
                can_extract: false,
                detected_offsets: vec![],
                estimated_titles: 0,
            },
            0,
        )
    };

    // 1. Check if files are already extracted in raw_dir
    let mut extracted_titles = Vec::new();
    if dirs.raw.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&dirs.raw) {
            let mut idx = 1;
            for entry in entries.flatten() {
                let ep = entry.path();
                if ep.is_file() {
                    if let Some(ext) = ep.extension().and_then(|e| e.to_str()) {
                        let ext_l = ext.to_ascii_lowercase();
                        if matches!(ext_l.as_str(), "mkv" | "mp4" | "mpg" | "vro" | "vob" | "ts") {
                            let sz = ep.metadata().map(|m| m.len()).unwrap_or(0);
                            let sz_mb = ((sz as f64) / (1024.0 * 1024.0) * 10.0).round() / 10.0;
                            let fname = ep
                                .file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or_default()
                                .to_string();
                            let stem = ep.file_stem().and_then(|s| s.to_str()).unwrap_or_default();
                            let chapters = generate_panasonic_chapters(
                                3600.0,
                                PANASONIC_CHAPTER_INTERVAL_SEC,
                            );
                            let path_str = ep.to_string_lossy().to_string();

                            extracted_titles.push(json!({
                                "id": idx,
                                "title": format!("Title {idx:02} ({stem})"),
                                "filename": fname,
                                "path": path_str,
                                "size_mb": sz_mb,
                                "duration_sec": 3600.0,
                                "duration_formatted": "01:00:00",
                                "recorded_date": "Auto-Detect",
                                "format": "MPEG-2 PS / H.264",
                                "chapters": chapters,
                                "thumbnail_url": format!("/api/media/thumbnail?path={path_str}"),
                                "is_extracted": true
                            }));
                            idx += 1;
                        }
                    }
                }
            }
        }
    }

    if !inspection.is_panasonic {
        if !extracted_titles.is_empty() {
            let total_mb: f64 = extracted_titles
                .iter()
                .filter_map(|t| t.get("size_mb").and_then(Value::as_f64))
                .sum();
            return ApiResponse::ok(&json!({
                "source_path": source_path,
                "is_panasonic": true,
                "format": "MEIHDFS-V2.0 / Local Library",
                "total_titles": extracted_titles.len(),
                "total_size_mb": (total_mb * 10.0).round() / 10.0,
                "titles": extracted_titles
            }));
        }

        return ApiResponse::ok(&json!({
            "source_path": source_path,
            "is_panasonic": false,
            "format": "UNKNOWN",
            "total_titles": 0,
            "total_size_mb": 0.0,
            "titles": []
        }));
    }

    // Source is a recognized Panasonic disk image
    let total_mb = ((file_size as f64) / (1024.0 * 1024.0) * 10.0).round() / 10.0;
    let estimated_titles = inspection.estimated_titles.max(1);
    let mut titles = Vec::new();

    let title_mb = if estimated_titles > 0 {
        ((total_mb / (estimated_titles as f64)) * 10.0).round() / 10.0
    } else {
        0.0
    };

    for i in 1..=estimated_titles {
        let chapters = generate_panasonic_chapters(
            PANASONIC_DEFAULT_TITLE_DURATION_SEC,
            PANASONIC_CHAPTER_INTERVAL_SEC,
        );
        titles.push(json!({
            "id": i,
            "title": format!("Title {i:02} - Panasonic {}", inspection.format.as_str()),
            "filename": format!("panasonic_title_{i:02}.mpg"),
            "path": source_path,
            "size_mb": title_mb,
            "duration_sec": PANASONIC_DEFAULT_TITLE_DURATION_SEC,
            "duration_formatted": "01:00:00",
            "recorded_date": "Auto-Detect (MEIHDFS)",
            "format": inspection.format.as_str(),
            "chapters": chapters,
            "thumbnail_url": format!("/api/media/thumbnail?path={source_path}"),
            "is_extracted": false
        }));
    }

    ApiResponse::ok(&json!({
        "source_path": source_path,
        "is_panasonic": true,
        "format": inspection.format.as_str(),
        "total_titles": titles.len(),
        "total_size_mb": total_mb,
        "titles": titles
    }))
}

pub fn handle_disks() -> ApiResponse {
    let drives = detect_connected_drives();
    let total = drives.len();
    ApiResponse::ok(&json!({
        "drives": drives,
        "disks": drives,
        "total": total
    }))
}

pub fn handle_extract(req: &ApiRequest, ctx: &AppContext) -> ApiResponse {
    if ctx.process.is_running() {
        return ApiResponse::error(409, "Another restoration or ingestion pipeline is currently running.");
    }
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

    ctx.process.set_in_process_active(true);
    let res = execute_panasonic_extraction(source, output_dir, None);
    ctx.process.set_in_process_active(false);

    match res {
        Ok(files) => ApiResponse::ok(&json!({
            "status": "success",
            "message": "Panasonic extraction completed successfully.",
            "extracted_files": files,
            "destination": output_dir
        })),
        Err(e) => ApiResponse::error(500, &e),
    }
}

pub fn handle_extract_titles(req: &ApiRequest, ctx: &AppContext) -> ApiResponse {
    if ctx.process.is_running() {
        return ApiResponse::error(409, "Another restoration or ingestion pipeline is currently running.");
    }
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

    let selected_ids: Option<Vec<u32>> = parsed
        .get("selected_titles")
        .or_else(|| parsed.get("titles"))
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_u64)
                .map(|n| n as u32)
                .collect()
        });

    ctx.process.set_in_process_active(true);
    let res = execute_panasonic_extraction(source, output_dir, selected_ids.as_deref());
    ctx.process.set_in_process_active(false);

    match res {
        Ok(files) => ApiResponse::ok(&json!({
            "status": "success",
            "message": "Selected Panasonic titles extracted successfully.",
            "extracted_files": files,
            "destination": output_dir
        })),
        Err(e) => ApiResponse::error(500, &e),
    }
}
