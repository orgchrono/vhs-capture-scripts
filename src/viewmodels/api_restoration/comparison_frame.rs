//! Comparison & Live Restoration Frame Service (`api_restoration/comparison_frame.rs`).

use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::infrastructure::security::is_safe_media_path;
use crate::infrastructure::toolchain::resolve_executable_path;
use crate::models::constants::{COMPARISON_PREVIEW_HEIGHT, COMPARISON_PREVIEW_WIDTH};
use crate::viewmodels::api_support::{media_dirs, resolve_media_input};
use crate::viewmodels::api_types::{ApiRequest, ApiResponse};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComparisonFrameResult {
    pub status: String,
    pub timestamp: f64,
    pub duration: f64,
    pub raw_image: String,
    pub processed_image: String,
    pub width: u32,
    pub height: u32,
}

/// Unified comparison frame extractor shared across REST and Tauri IPC.
#[must_use]
pub fn extract_comparison_frame_unified(
    source: &str,
    timestamp: f64,
    deinterlacer: &str,
    denoise: bool,
    chroma_fix: bool,
    overscan: bool,
    dropout: bool,
) -> ComparisonFrameResult {
    let dirs = media_dirs();
    let resolved_source = if !source.is_empty() {
        resolve_media_input(source, &dirs).unwrap_or_else(|| source.to_string())
    } else {
        String::new()
    };

    let p = Path::new(&resolved_source);
    let ffmpeg_bin = resolve_executable_path("ffmpeg", None, None);
    let ffprobe_bin = resolve_executable_path("ffprobe", None, None);

    let probed_duration = if !resolved_source.is_empty() && p.is_file() {
        if let Some(ref probe_bin) = ffprobe_bin {
            crate::infrastructure::probe::probe_media_file(&resolved_source, &probe_bin.to_string_lossy())
                .map(|pr| pr.duration)
                .unwrap_or(0.0)
        } else {
            0.0
        }
    } else {
        0.0
    };

    let width = COMPARISON_PREVIEW_WIDTH;
    let height = COMPARISON_PREVIEW_HEIGHT;

    if !resolved_source.is_empty()
        && is_safe_media_path(&resolved_source, &dirs.roots())
        && p.is_file()
    {
        if let Some(ffmpeg) = ffmpeg_bin {
            // Raw frame extraction
            let scale_filter = format!("scale={width}:{height}:force_original_aspect_ratio=decrease,setsar=1:1");
            let mut raw_cmd = crate::infrastructure::toolchain::create_silent_command(&ffmpeg);
            raw_cmd.args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-accurate_seek",
                "-ss",
                &format!("{timestamp:.3}"),
                "-i",
                &resolved_source,
                "-frames:v",
                "1",
                "-vf",
                &scale_filter,
                "-f",
                "image2",
                "-c:v",
                "mjpeg",
                "pipe:1",
            ]);

            // Faithful pipeline filter chain matching chosen restoration specs in strict physical order.
            let mut filters = Vec::new();
            if !deinterlacer.eq_ignore_ascii_case("none") {
                filters.push("bwdif=mode=0:parity=-1:deint=1".to_string());
            }
            if dropout {
                filters.push("removegrain=m=1".to_string());
            }
            if chroma_fix {
                filters.push("chromashift=cbh=2:cbv=1:crh=2:crv=1:edge=smear".to_string());
            }
            if denoise {
                filters.push("hqdn3d=4.0:3.0:6.0:4.5".to_string());
            }
            if overscan {
                filters.push("drawbox=y=ih-16:color=black:width=iw:height=16:t=fill".to_string());
            }
            filters.push(scale_filter);
            let proc_vf = filters.join(",");

            let mut proc_cmd = crate::infrastructure::toolchain::create_silent_command(&ffmpeg);
            proc_cmd.args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-accurate_seek",
                "-ss",
                &format!("{timestamp:.3}"),
                "-i",
                &resolved_source,
                "-frames:v",
                "1",
                "-vf",
                &proc_vf,
                "-f",
                "image2",
                "-c:v",
                "mjpeg",
                "pipe:1",
            ]);

            let (raw_out, proc_out) = std::thread::scope(|s| {
                let raw_handle = s.spawn(|| raw_cmd.output().ok());
                let proc_handle = s.spawn(|| proc_cmd.output().ok());
                (
                    raw_handle.join().unwrap_or(None),
                    proc_handle.join().unwrap_or(None),
                )
            });

            if let (Some(r), Some(pr)) = (raw_out, proc_out) {
                if r.status.success()
                    && pr.status.success()
                    && !r.stdout.is_empty()
                    && !pr.stdout.is_empty()
                {
                    let raw_b64 = format!(
                        "data:image/jpeg;base64,{}",
                        crate::infrastructure::obs::base64_encode(&r.stdout)
                    );
                    let proc_b64 = format!(
                        "data:image/jpeg;base64,{}",
                        crate::infrastructure::obs::base64_encode(&pr.stdout)
                    );

                    return ComparisonFrameResult {
                        status: "ok".to_string(),
                        timestamp,
                        duration: probed_duration,
                        raw_image: raw_b64,
                        processed_image: proc_b64,
                        width,
                        height,
                    };
                }
            }
        }
    }

    ComparisonFrameResult {
        status: "ok".to_string(),
        timestamp,
        duration: probed_duration,
        raw_image: String::new(),
        processed_image: String::new(),
        width,
        height,
    }
}

pub fn handle_comparison_frame(req: &ApiRequest) -> ApiResponse {
    let source = req.query("source").unwrap_or_default();
    let timestamp = req
        .query("timestamp")
        .and_then(|t| t.parse::<f64>().ok())
        .unwrap_or(5.0)
        .max(0.0);
    let deinterlacer = req
        .query("deinterlacer")
        .unwrap_or_else(|| "qtgmc".to_string());
    let denoise = req.query("denoise").map(|d| d != "false").unwrap_or(true);
    let chroma_fix = req
        .query("chroma_fix")
        .map(|c| c != "false")
        .unwrap_or(true);
    let overscan = req
        .query("overscan")
        .map(|o| o != "false")
        .unwrap_or(false);
    let dropout = req
        .query("dropout")
        .map(|d| d != "false")
        .unwrap_or(false);

    let result = extract_comparison_frame_unified(
        &source,
        timestamp,
        &deinterlacer,
        denoise,
        chroma_fix,
        overscan,
        dropout,
    );

    let val = serde_json::to_value(&result).unwrap_or_else(|_| json!({}));
    ApiResponse::ok(&val)
}

pub fn handle_live_frame() -> ApiResponse {
    let dirs = media_dirs();
    let live_frame_path = dirs.work.join("live_frame.jpg");
    if live_frame_path.is_file() {
        if let Ok(bytes) = fs::read(&live_frame_path) {
            if bytes.len() > 100 {
                let b64 = crate::infrastructure::obs::base64_encode(&bytes);
                return ApiResponse::ok(&json!({
                    "status": "ok",
                    "has_frame": true,
                    "frame": format!("data:image/jpeg;base64,{b64}")
                }));
            }
        }
    }

    ApiResponse::ok(&json!({
        "status": "ok",
        "has_frame": false,
        "frame": ""
    }))
}
