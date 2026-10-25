//! Restoration API Subrouter ViewModel (`viewmodels::api_restoration`).
//!
//! Exposes REST endpoints for video restoration pipelines, presets, process lifecycle,
//! incomplete job management, and comparison frames.

pub mod checkpoint_handlers;
pub mod comparison_frame;
pub mod lifecycle_handlers;
pub mod qc_handlers;
pub mod whisper_service;

pub use checkpoint_handlers::{handle_check_existing, handle_incomplete_action, handle_incomplete_list};
pub use comparison_frame::{extract_comparison_frame_unified, handle_comparison_frame, handle_live_frame, ComparisonFrameResult};
pub use lifecycle_handlers::{
    handle_abort, handle_action, handle_pause, handle_preset_config, handle_resume,
    handle_run_pipeline, handle_status, start_restoration_unified,
};
pub use qc_handlers::{handle_install_qtgmc, handle_qc_report};
pub use whisper_service::{handle_detect_whisper_language, handle_generate_subtitles};

use crate::infrastructure::app_context::AppContext;
use crate::viewmodels::api_types::{ApiRequest, ApiResponse};

/// Handles incoming restoration requests. Returns `None` if the path is not matched.
#[must_use]
pub fn handle_restoration_route(req: &ApiRequest, ctx: &AppContext) -> Option<ApiResponse> {
    match (req.method.as_str(), req.clean_path()) {
        ("POST", "/api/run") => Some(handle_run_pipeline(req, ctx)),
        ("POST", "/api/action") => Some(handle_action(req, ctx)),
        ("POST", "/api/pause") => Some(handle_pause(ctx)),
        ("POST", "/api/resume") => Some(handle_resume(ctx)),
        ("POST", "/api/abort") => Some(handle_abort(ctx)),
        ("GET", "/api/restoration/status") => Some(handle_status(ctx)),
        ("GET", "/api/restoration/preset-config") => Some(handle_preset_config(req)),
        ("GET", "/api/restoration/check-existing") => Some(handle_check_existing(req)),
        ("GET", "/api/incomplete-jobs") | ("GET", "/api/restoration/incomplete") => {
            Some(handle_incomplete_list())
        }
        ("POST", "/api/incomplete-jobs/action")
        | ("POST", "/api/restoration/incomplete/action") => {
            Some(handle_incomplete_action(req, ctx))
        }
        ("GET", "/api/restoration/qc-report") => Some(handle_qc_report(req)),
        ("POST", "/api/install_qtgmc") => Some(handle_install_qtgmc(ctx)),
        ("GET", "/api/monitor/comparison-frame") => Some(handle_comparison_frame(req)),
        ("GET", "/api/monitor/live-restoration-frame") => Some(handle_live_frame()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_preset_config_endpoint() {
        let tmp = std::env::temp_dir().join(format!("vhs_resto_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp);
        let ctx = AppContext::new_test(&tmp);

        let req = ApiRequest {
            method: "GET".to_string(),
            path: "/api/restoration/preset-config?preset=gold".to_string(),
            body_json: String::new(),
        };
        let res = handle_restoration_route(&req, &ctx).expect("matched route");
        assert_eq!(res.status_code, 200);
        assert!(res.body_json.contains("\"crf\":18"));
        assert!(res.body_json.contains("\"deinterlacer\":\"qtgmc\""));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_status_endpoint() {
        let tmp = std::env::temp_dir().join(format!("vhs_resto_test_2_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp);
        let ctx = AppContext::new_test(&tmp);

        let req = ApiRequest {
            method: "GET".to_string(),
            path: "/api/restoration/status".to_string(),
            body_json: String::new(),
        };
        let res = handle_restoration_route(&req, &ctx).expect("matched route");
        assert_eq!(res.status_code, 200);
        assert!(res.body_json.contains("\"active\":false"));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_incomplete_endpoints_and_actions() {
        let tmp = std::env::temp_dir().join(format!("vhs_resto_test_incomp_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp);
        let ctx = AppContext::new_test(&tmp);

        let req_list = ApiRequest {
            method: "GET".to_string(),
            path: "/api/restoration/incomplete".to_string(),
            body_json: String::new(),
        };
        let res_list = handle_restoration_route(&req_list, &ctx).expect("matched route");
        assert_eq!(res_list.status_code, 200);
        assert!(res_list.body_json.contains("\"incomplete_jobs\":"));
        assert!(res_list.body_json.contains("\"total\":"));

        // Test check-existing
        let req_check = ApiRequest {
            method: "GET".to_string(),
            path: "/api/restoration/check-existing?source=nonexistent.mkv".to_string(),
            body_json: String::new(),
        };
        let res_check = handle_restoration_route(&req_check, &ctx).expect("matched route");
        assert_eq!(res_check.status_code, 200);
        assert!(res_check.body_json.contains("\"has_existing\":false"));

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_whisper_endpoints() {
        let tmp = std::env::temp_dir().join(format!("vhs_whisper_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp);
        let ctx = AppContext::new_test(&tmp);

        let req_detect = ApiRequest {
            method: "POST".to_string(),
            path: "/api/action".to_string(),
            body_json: r#"{"action":"detect_whisper_language","input":""}"#.to_string(),
        };
        let res_detect = handle_restoration_route(&req_detect, &ctx).expect("matched route");
        assert_eq!(res_detect.status_code, 200);
        assert!(res_detect.body_json.contains("\"language\":\"pt\""));

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
