//! System API ViewModel: session token, status, hardware, metrics, logs and preferences.
//! Port of legacy `api/routers/system.py`.

use crate::infrastructure::app_context::AppContext;
use crate::infrastructure::cpu_usage::sample_cpu_percent;
use crate::infrastructure::hardware::{detect_system_ram_gb, get_active_hardware_profile};
use crate::infrastructure::toolchain::{
    detect_best_ffmpeg_encoder, is_obs_running, is_vapoursynth_available,
};
use crate::models::media::scan_media_directory;
use crate::models::preferences::{merge_preferences, to_ui_json};
use crate::viewmodels::api_support::{load_preferences, media_dirs, save_preferences};
use crate::viewmodels::api_types::{ApiRequest, ApiResponse};
use serde_json::{json, Value};
use std::path::Path;

/// Engine identifier reported to the UI.
const ENGINE_ID: &str = "rust-native-2.1.0";

fn round_to(value: f64, decimals: i32) -> f64 {
    let factor = 10f64.powi(decimals);
    (value * factor).round() / factor
}

fn list_media(dir: &Path) -> Vec<Value> {
    scan_media_directory(dir)
        .unwrap_or_default()
        .into_iter()
        .map(|f| json!({ "name": f.name, "path": f.path, "size_mb": round_to(f.size_mb, 2) }))
        .collect()
}

/// Pure RAM telemetry projection `(used_gb, total_gb, used_percent)`.
#[must_use]
pub fn ram_usage(total_gb: f32, available_gb: f32) -> (f64, f64, f64) {
    let total = f64::from(total_gb);
    let used = (total - f64::from(available_gb)).max(0.0);
    let percent = if total > 0.0 { used / total * 100.0 } else { 0.0 };
    (round_to(used, 2), round_to(total, 2), round_to(percent, 1))
}

fn status(ctx: &AppContext) -> ApiResponse {
    let dirs = media_dirs();
    let snapshot = ctx.process.snapshot();
    let encoder = detect_best_ffmpeg_encoder("h264");
    let vs = is_vapoursynth_available();
    let obs = is_obs_running();
    let raw = list_media(&dirs.raw);
    let restored = list_media(&dirs.restored);
    let hw = get_active_hardware_profile();
    let cpu = sample_cpu_percent();
    ApiResponse::ok(&json!({
        "status": "ready",
        "engine": ENGINE_ID,
        "encoder": encoder,
        "vapoursynth_available": vs,
        "obs_connected": obs,
        "obs_recording": false,
        "raw_files": raw,
        "restored_files": restored,
        "process_running": snapshot.running,
        "process_logs": ctx.process.logs(),
        "hardware": hw,
        "health": { "dropped_frames": 0, "fps": 0.0, "cpu": cpu },
    }))
}

fn metrics(ctx: &AppContext) -> ApiResponse {
    let (total, available) = detect_system_ram_gb();
    let (used, total, percent) = ram_usage(total, available);
    let snapshot = ctx.process.snapshot();
    ApiResponse::ok(&json!({
        "cpu_percent": sample_cpu_percent(),
        "ram_used_gb": used,
        "ram_total_gb": total,
        "ram_percent": percent,
        "process_running": snapshot.running,
        "is_paused": snapshot.paused,
    }))
}

fn logs(ctx: &AppContext) -> ApiResponse {
    let snapshot = ctx.process.snapshot();
    ApiResponse::ok(&json!({
        "active": snapshot.running,
        "logs": ctx.process.logs(),
        "exit_code": snapshot.last_exit_code,
        "success": snapshot.last_success,
    }))
}

fn save_preferences_route(req: &ApiRequest) -> ApiResponse {
    let current = load_preferences();
    let merged = merge_preferences(&current, &req.json_body());
    match save_preferences(&merged) {
        Ok(()) => ApiResponse::ok(&json!({ "success": true, "preferences": to_ui_json(&merged) })),
        Err(err) => ApiResponse::ok(&json!({
            "success": false,
            "error": err,
            "preferences": to_ui_json(&current),
        })),
    }
}

/// Routes owned by the system ViewModel; `None` when the request is not a system route.
#[must_use]
pub fn handle_system_route(req: &ApiRequest, ctx: &AppContext) -> Option<ApiResponse> {
    handle(ctx, req)
}

/// Routes owned by the system ViewModel; `None` when the request is not a system route.
#[must_use]
pub fn handle(ctx: &AppContext, req: &ApiRequest) -> Option<ApiResponse> {
    let response = match (req.method.as_str(), req.clean_path()) {
        ("GET", "/api/token") => ApiResponse::ok(&json!({ "token": ctx.session_token })),
        ("GET", "/api/status") => status(ctx),
        ("GET", "/api/hardware") => ApiResponse::ok(&get_active_hardware_profile()),
        ("GET", "/api/system/metrics") => metrics(ctx),
        ("GET", "/api/logs") => logs(ctx),
        ("GET", "/api/preferences") => ApiResponse::ok(&to_ui_json(&load_preferences())),
        ("POST", "/api/preferences") => save_preferences_route(req),
        _ => return None,
    };
    Some(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ram_usage_projection() {
        assert_eq!(ram_usage(16.0, 4.0), (12.0, 16.0, 75.0));
        assert_eq!(ram_usage(0.0, 0.0), (0.0, 0.0, 0.0));
        assert_eq!(ram_usage(8.0, 9.0).0, 0.0);
    }
}
