//! Ingest & Panasonic DVR Subrouter ViewModel (`viewmodels::api_ingest`).
//!
//! Exposes REST endpoints for media ingestion and Panasonic DVR extraction:
//! - `GET  /api/ingest/panasonic/inspect`
//! - `GET  /api/ingest/panasonic/tree`
//! - `GET  /api/ingest/panasonic/disks` & `GET /api/panasonic/drives`
//! - `POST /api/ingest/panasonic/extract`
//! - `POST /api/ingest/panasonic/extract-titles`

use crate::infrastructure::app_context::AppContext;
use crate::infrastructure::panasonic::{
    classify_panasonic_probe, detect_connected_drives, generate_panasonic_chapters,
    PanasonicFilesystemFormat, PanasonicInspection, PANASONIC_CHAPTER_INTERVAL_SEC,
    PANASONIC_DEFAULT_TITLE_DURATION_SEC,
};
use crate::infrastructure::security::is_safe_ingest_path;
use crate::infrastructure::toolchain::{create_silent_command, resolve_executable_path};
use crate::viewmodels::api_support::media_dirs;
use crate::viewmodels::api_types::{ApiRequest, ApiResponse};
use serde_json::{json, Value};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

const PROBE_BUFFER_MAX_BYTES: usize = 65_536; // 64 KB probe buffer
const PANASONIC_MEIHDFS_OFFSETS: [u64; 3] = [0x0160_0000, 0x1600_0000, 0xA400_0000];

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

    let mut inspection = classify_panasonic_probe(&probe_buf, file_size, &filename);

    // Deep seek fallback for raw HDD dumps whose partition superblocks are located at known offsets
    if !inspection.is_panasonic && file_size > PANASONIC_MEIHDFS_OFFSETS[0] {
        if let Ok(mut f) = File::open(p) {
            for &offset in &PANASONIC_MEIHDFS_OFFSETS {
                if offset + (PROBE_BUFFER_MAX_BYTES as u64) <= file_size
                    && f.seek(SeekFrom::Start(offset)).is_ok()
                {
                    let mut deep_buf = vec![0u8; PROBE_BUFFER_MAX_BYTES];
                    if f.read_exact(&mut deep_buf).is_ok() {
                        let deep_insp = classify_panasonic_probe(&deep_buf, file_size, &filename);
                        if deep_insp.is_panasonic {
                            let mut adjusted_offsets: Vec<usize> = deep_insp
                                .detected_offsets
                                .into_iter()
                                .map(|o| o + (offset as usize))
                                .collect();
                            if adjusted_offsets.is_empty() {
                                adjusted_offsets.push(offset as usize);
                            }
                            inspection = PanasonicInspection {
                                detected_offsets: adjusted_offsets,
                                ..deep_insp
                            };
                            break;
                        }
                    }
                }
            }
        }
    }

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

fn handle_tree(req: &ApiRequest) -> ApiResponse {
    let source_path = match req.query("source_path") {
        Some(p) if !p.trim().is_empty() => p,
        _ => return ApiResponse::error(400, "Missing required query parameter 'source_path'"),
    };

    let dirs = media_dirs();
    if !is_safe_ingest_path(&source_path, &dirs.roots()) {
        return ApiResponse::error(400, "Invalid or unsafe source path.");
    }

    let p = Path::new(&source_path);
    let file_size = if p.exists() {
        p.metadata().map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

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

fn handle_disks() -> ApiResponse {
    let drives = detect_connected_drives();
    let total = drives.len();
    ApiResponse::ok(&json!({
        "drives": drives,
        "disks": drives,
        "total": total
    }))
}

fn execute_panasonic_extraction(
    source_path: &str,
    output_dir: &str,
    selected_title_ids: Option<&[u32]>,
) -> Result<Vec<String>, String> {
    let out_p = Path::new(output_dir);
    if let Err(e) = std::fs::create_dir_all(out_p) {
        return Err(format!("Failed to create destination directory: {e}"));
    }

    let src_p = Path::new(source_path);
    if !src_p.exists() {
        return Err(format!("Source path does not exist: {source_path}"));
    }

    let extractor = resolve_executable_path("extract_meihdfs", None, None)
        .or_else(|| resolve_executable_path("dvd-vr", None, None))
        .or_else(|| resolve_executable_path("ffmpeg", None, None));

    let bin_path = match extractor {
        Some(bin) => bin,
        None => return Err("No Panasonic extraction toolchain binary available.".to_string()),
    };

    let bin_name = bin_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let mut cmd = create_silent_command(&bin_path);

    if bin_name.contains("extract_meihdfs") {
        cmd.args([source_path, output_dir]);
    } else if bin_name.contains("dvd-vr") {
        cmd.args(["-n", "[ts]-[label]#[pgm]", source_path]);
        cmd.current_dir(out_p);
    } else {
        let target_file = out_p.join("panasonic_extracted.mpg");
        cmd.args([
            "-y",
            "-i",
            source_path,
            "-c",
            "copy",
            &target_file.to_string_lossy(),
        ]);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Extraction tool spawn error: {e}"))?;

    // Stage 2: If extract_meihdfs was run, inspect output directory for DVD_RTAV VR_MANGR.IFO and VR_MOVIE.VRO.
    // If dvd-vr tool is available, split the raw continuous .VRO into individual program titles.
    if bin_name.contains("extract_meihdfs") {
        if let Some(dvd_vr_bin) = resolve_executable_path("dvd-vr", None, None) {
            let possible_dirs = [out_p.join("DVD_RTAV"), out_p.to_path_buf()];
            for dir in &possible_dirs {
                let ifo_candidates = ["VR_MANGR.IFO", "vr_mangr.ifo"];
                let vro_candidates = ["VR_MOVIE.VRO", "vr_movie.vro"];

                let ifo = ifo_candidates.iter().map(|n| dir.join(n)).find(|p| p.exists());
                let vro = vro_candidates.iter().map(|n| dir.join(n)).find(|p| p.exists());

                if let (Some(ifo_path), Some(vro_path)) = (ifo, vro) {
                    let mut dvd_vr_cmd = create_silent_command(&dvd_vr_bin);
                    dvd_vr_cmd.args([
                        "-n",
                        "[ts]-[label]#[pgm]",
                        &ifo_path.to_string_lossy(),
                        &vro_path.to_string_lossy(),
                    ]);
                    dvd_vr_cmd.current_dir(out_p);
                    let _ = dvd_vr_cmd.output();
                    break;
                }
            }
        }
    }

    let mut extracted_files = Vec::new();
    let mut dirs_to_scan = vec![out_p.to_path_buf()];
    while let Some(dir) = dirs_to_scan.pop() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    dirs_to_scan.push(p);
                } else if p.is_file() {
                    if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                        let ext_l = ext.to_ascii_lowercase();
                        if matches!(ext_l.as_str(), "mpg" | "vro" | "vob" | "mp4" | "mkv" | "ts") {
                            extracted_files.push(p.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    if let Some(ids) = selected_title_ids {
        if !ids.is_empty() && extracted_files.len() > 1 {
            extracted_files.retain(|f| {
                ids.iter()
                    .any(|id| f.contains(&format!("{id:02}")) || f.contains(&format!("#{id}")))
            });
        }
    }

    if !output.status.success() && extracted_files.is_empty() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Extraction command failed: {err}"));
    }

    Ok(extracted_files)
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

    match execute_panasonic_extraction(source, output_dir, None) {
        Ok(files) => ApiResponse::ok(&json!({
            "status": "success",
            "message": "Panasonic extraction completed successfully.",
            "extracted_files": files,
            "destination": output_dir
        })),
        Err(e) => ApiResponse::error(500, &e),
    }
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

    match execute_panasonic_extraction(source, output_dir, selected_ids.as_deref()) {
        Ok(files) => ApiResponse::ok(&json!({
            "status": "success",
            "message": "Selected Panasonic titles extracted successfully.",
            "extracted_files": files,
            "destination": output_dir
        })),
        Err(e) => ApiResponse::error(500, &e),
    }
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

    #[test]
    fn test_tree_returns_valid_panasonic_tree_contract() {
        let tmp = std::env::temp_dir().join(format!("vhs_ingest_test_tree_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp);
        let ctx = AppContext::new_test(&tmp);

        let dummy_source = tmp.join("test_panasonic.img");
        let _ = std::fs::write(&dummy_source, b"test_empty_image");

        let req = ApiRequest {
            method: "GET".to_string(),
            path: format!(
                "/api/ingest/panasonic/tree?source_path={}",
                dummy_source.to_string_lossy()
            ),
            body_json: String::new(),
        };
        let res = handle_ingest_route(&req, &ctx).expect("matched route");
        assert_eq!(res.status_code, 200);
        assert!(res.body_json.contains("\"titles\":"));
        assert!(res.body_json.contains("\"total_titles\":"));
        assert!(res.body_json.contains("\"is_panasonic\":"));
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
