//! Pure Functional REST/IPC API Router ViewModel (`viewmodels::api_router`).
//!
//! Coordinates incoming `/api/*` requests across specialized domain subrouters:
//! - `api_system`: Host telemetry, metrics, hardware, logs, token, preferences
//! - `api_restoration`: Pipeline execution, process lifecycle, presets, recovery
//! - `api_queue`: Batch queue persistence, enqueue, cancel, worker control
//! - `api_ingest`: Panasonic DVR probing, extraction, drive enumeration
//! - `api_obs`: OBS Studio websocket control, status, virtual camera
//! - `storage_vm`: Cloud and local storage configuration

pub use crate::viewmodels::api_types::{ApiRequest, ApiResponse};

use crate::infrastructure::app_context::AppContext;
use crate::viewmodels::api_ingest::handle_ingest_route;
use crate::viewmodels::api_obs::handle_obs_route;
use crate::viewmodels::api_queue::handle_queue_route;
use crate::viewmodels::api_restoration::handle_restoration_route;
use crate::viewmodels::api_system::handle_system_route;
use crate::viewmodels::storage_vm::{ipc_get_storage_config, ipc_save_storage_config};
use serde_json::{json, Value};
use std::sync::OnceLock;

/// Pure functional router dispatching `/api/*` requests using an explicit runtime context.
#[must_use]
pub fn dispatch_api_request_with_context(req: &ApiRequest, ctx: &AppContext) -> ApiResponse {
    if let Some(resp) = handle_system_route(req, ctx) {
        return resp;
    }
    if let Some(resp) = handle_restoration_route(req, ctx) {
        return resp;
    }
    if let Some(resp) = handle_queue_route(req, ctx) {
        return resp;
    }
    if let Some(resp) = handle_ingest_route(req, ctx) {
        return resp;
    }
    if let Some(resp) = handle_obs_route(req, ctx) {
        return resp;
    }

    // Storage configuration endpoints
    let clean_path = req.path.split('?').next().unwrap_or(req.path.as_str());
    match (req.method.as_str(), clean_path) {
        ("GET", "/api/storage/config") => {
            let envelope = ipc_get_storage_config();
            ApiResponse::ok(&serde_json::to_value(envelope).unwrap_or_else(|_| json!({})))
        }
        ("POST", "/api/storage/config") => {
            let parsed: Value = serde_json::from_str(&req.body_json).unwrap_or_else(|_| json!({}));
            let provider = parsed
                .get("provider")
                .and_then(Value::as_str)
                .unwrap_or("local");
            let cfg = parsed.get("config").cloned().unwrap_or_else(|| json!({}));
            match ipc_save_storage_config(provider, &cfg) {
                Ok(status) => ApiResponse::ok(&json!({
                    "status": "ok",
                    "storage_status": status
                })),
                Err(e) => ApiResponse::error(400, &e),
            }
        }
        _ => ApiResponse::error(
            404,
            &format!("Route not found: {} {}", req.method, req.path),
        ),
    }
}

/// Convenience dispatcher using the global default runtime context.
#[must_use]
pub fn dispatch_api_request(req: &ApiRequest) -> ApiResponse {
    static DEFAULT_CTX: OnceLock<AppContext> = OnceLock::new();
    let ctx = DEFAULT_CTX.get_or_init(AppContext::default_runtime);
    dispatch_api_request_with_context(req, ctx)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn test_dispatch_status_and_token_routes() {
        let _guard = env_lock().lock().expect("env lock poisoned");
        let token_res = dispatch_api_request(&ApiRequest {
            method: "GET".to_string(),
            path: "/api/token".to_string(),
            body_json: String::new(),
        });
        assert_eq!(token_res.status_code, 200);
        assert!(token_res.body_json.contains("\"token\":"));

        let status_res = dispatch_api_request(&ApiRequest {
            method: "GET".to_string(),
            path: "/api/status".to_string(),
            body_json: String::new(),
        });
        assert_eq!(status_res.status_code, 200);
        assert!(status_res.body_json.contains("rust-native-2.1.0"));
    }

    #[test]
    fn test_dispatch_unknown_route_returns_404() {
        let res = dispatch_api_request(&ApiRequest {
            method: "GET".to_string(),
            path: "/api/nonexistent".to_string(),
            body_json: String::new(),
        });
        assert_eq!(res.status_code, 404);
    }

    #[test]
    fn test_status_includes_toolchain_and_hardware_fields() {
        let _guard = env_lock().lock().expect("env lock poisoned");
        let tmp = std::env::temp_dir().join(format!("vhs_status_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(tmp.join("media").join("raw"));
        let sample = tmp.join("media").join("raw").join("sample.mp4");
        let _ = std::fs::write(sample, vec![0u8; 2048]);
        let original_cwd = std::env::current_dir().expect("current_dir failed");

        std::env::set_current_dir(&tmp).expect("set cwd failed");
        let status_res = dispatch_api_request(&ApiRequest {
            method: "GET".to_string(),
            path: "/api/status".to_string(),
            body_json: String::new(),
        });
        assert_eq!(status_res.status_code, 200);
        assert!(status_res.body_json.contains("\"encoder\""));
        assert!(status_res.body_json.contains("\"hardware\""));
        assert!(status_res.body_json.contains("sample.mp4"));

        let _ = std::env::set_current_dir(original_cwd);
        let _ = std::fs::remove_dir_all(tmp);
    }

    #[test]
    fn test_preferences_post_persists_and_returns_success_envelope() {
        let _guard = env_lock().lock().expect("env lock poisoned");
        let tmp = std::env::temp_dir().join(format!("vhs_prefs_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp);
        unsafe {
            std::env::set_var("VHS_STUDIO_DIR", &tmp);
        }

        let res = dispatch_api_request(&ApiRequest {
            method: "POST".to_string(),
            path: "/api/preferences".to_string(),
            body_json: r#"{"rawDir":"D:/captures","theme":"dark"}"#.to_string(),
        });
        assert_eq!(res.status_code, 200);
        assert!(res.body_json.contains("\"success\":true"));
        assert!(res.body_json.contains("D:/captures"));

        let saved =
            std::fs::read_to_string(tmp.join("preferences.json")).expect("prefs file not saved");
        assert!(saved.contains("raw_dir"));

        unsafe {
            std::env::remove_var("VHS_STUDIO_DIR");
        }
        let _ = std::fs::remove_dir_all(tmp);
    }
}
