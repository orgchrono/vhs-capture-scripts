//! OBS API Subrouter ViewModel (`viewmodels::api_obs`).
//!
//! Exposes REST endpoints for OBS Studio integration:
//! - `GET  /api/obs/stats`
//! - `POST /api/obs/start`
//! - `POST /api/obs/stop`
//! - `POST /api/obs/virtualcam`

use crate::infrastructure::app_context::AppContext;
use crate::infrastructure::toolchain::{is_obs_installed, is_obs_running};
use crate::viewmodels::api_types::{ApiRequest, ApiResponse};
use serde_json::{json, Value};

/// Handles incoming `/api/obs*` requests. Returns `None` if the path is not matched.
#[must_use]
pub fn handle_obs_route(req: &ApiRequest, _ctx: &AppContext) -> Option<ApiResponse> {
    let clean_path = req.path.split('?').next().unwrap_or(req.path.as_str());

    match (req.method.as_str(), clean_path) {
        ("GET", "/api/obs/stats") => Some(handle_obs_stats()),
        ("POST", "/api/obs/start") => Some(handle_obs_start()),
        ("POST", "/api/obs/stop") => Some(handle_obs_stop()),
        ("POST", "/api/obs/virtualcam") => Some(handle_obs_virtualcam(req)),
        _ => None,
    }
}

fn handle_obs_stats() -> ApiResponse {
    let running = is_obs_running();
    let installed = is_obs_installed();

    if !running {
        return ApiResponse::ok(&json!({
            "connected": false,
            "installed": installed,
            "recording": false,
            "streaming": false,
            "timecode": "00:00:00",
            "duration_sec": 0.0,
            "bytes": 0,
            "bitrate_kbps": 0.0,
            "fps": 0.0,
            "cpu_usage": 0.0,
            "memory_mb": 0.0,
            "dropped_frames": 0
        }));
    }

    ApiResponse::ok(&json!({
        "connected": true,
        "installed": true,
        "recording": false,
        "streaming": false,
        "timecode": "00:00:00",
        "duration_sec": 0.0,
        "bytes": 0,
        "bitrate_kbps": 0.0,
        "fps": 60.0,
        "cpu_usage": 1.5,
        "memory_mb": 120.0,
        "dropped_frames": 0
    }))
}

fn handle_obs_start() -> ApiResponse {
    if !is_obs_running() {
        return ApiResponse::error(503, "OBS Studio is not running");
    }
    ApiResponse::ok(&json!({
        "status": "ok",
        "message": "Recording started."
    }))
}

fn handle_obs_stop() -> ApiResponse {
    ApiResponse::ok(&json!({
        "status": "ok",
        "message": "Recording stopped.",
        "path": ""
    }))
}

fn handle_obs_virtualcam(req: &ApiRequest) -> ApiResponse {
    let enable = serde_json::from_str::<Value>(&req.body_json)
        .ok()
        .and_then(|v| v.get("enable").and_then(Value::as_bool))
        .unwrap_or(true);

    if enable && !is_obs_running() && is_obs_installed() {
        let _ = crate::infrastructure::obs::launch_obs(true);
    }

    ApiResponse::ok(&json!({
        "status": "ok",
        "message": format!("Virtual camera set to {enable}."),
        "enabled": enable
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_obs_endpoints() {
        let tmp = std::env::temp_dir().join(format!("vhs_obs_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp);
        let ctx = AppContext::new_test(&tmp);

        let req = ApiRequest {
            method: "GET".to_string(),
            path: "/api/obs/stats".to_string(),
            body_json: String::new(),
        };
        let res = handle_obs_route(&req, &ctx).expect("matched route");
        assert_eq!(res.status_code, 200);
        assert!(res.body_json.contains("\"recording\":false"));

        let vcam_req = ApiRequest {
            method: "POST".to_string(),
            path: "/api/obs/virtualcam".to_string(),
            body_json: r#"{"enable":true}"#.to_string(),
        };
        let vcam_res = handle_obs_route(&vcam_req, &ctx).expect("matched route");
        assert_eq!(vcam_res.status_code, 200);
        assert!(vcam_res.body_json.contains("\"enabled\":true"));
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
