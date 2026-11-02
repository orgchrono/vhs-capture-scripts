//! Ingest & Panasonic DVR Subrouter ViewModel (`viewmodels::api_ingest`).
//!
//! Exposes REST endpoints for media ingestion, Panasonic DVR extraction, and raw disk imaging:
//! - `GET  /api/ingest/panasonic/inspect`
//! - `GET  /api/ingest/panasonic/tree`
//! - `GET  /api/ingest/panasonic/disks` & `GET /api/panasonic/drives`
//! - `POST /api/ingest/panasonic/extract`
//! - `POST /api/ingest/panasonic/extract-titles`
//! - `GET  /api/ingest/disk-image/drives`
//! - `POST /api/ingest/disk-image/start`
//! - `POST /api/ingest/disk-image/cancel`

pub mod disk_image_routes;
pub mod panasonic_routes;

pub use disk_image_routes::*;
pub use panasonic_routes::*;

use crate::infrastructure::app_context::AppContext;
use crate::viewmodels::api_types::{ApiRequest, ApiResponse};

/// Handles incoming `/api/ingest/*` and `/api/panasonic/*` requests.
#[must_use]
pub fn handle_ingest_route(req: &ApiRequest, ctx: &AppContext) -> Option<ApiResponse> {
    match (req.method.as_str(), req.clean_path()) {
        ("GET", "/api/ingest/panasonic/inspect") => Some(handle_inspect(req)),
        ("GET", "/api/ingest/panasonic/tree") => Some(handle_tree(req)),
        ("GET", "/api/ingest/panasonic/disks") | ("GET", "/api/panasonic/drives") => {
            Some(handle_disks())
        }
        ("POST", "/api/ingest/panasonic/extract") => Some(handle_extract(req, ctx)),
        ("POST", "/api/ingest/panasonic/extract-titles") => Some(handle_extract_titles(req, ctx)),
        ("GET", "/api/ingest/disk-image/drives") => Some(handle_disk_image_drives()),
        ("POST", "/api/ingest/disk-image/start") => Some(handle_disk_image_start(req, ctx)),
        ("POST", "/api/ingest/disk-image/cancel") => Some(handle_disk_image_cancel(ctx)),
        _ => None,
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

    #[test]
    fn test_disk_image_routes_roundtrip() {
        let tmp = std::env::temp_dir().join(format!("vhs_disk_imager_api_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp);
        let ctx = AppContext::new_test(&tmp);

        // GET /api/ingest/disk-image/drives
        let req_drives = ApiRequest {
            method: "GET".to_string(),
            path: "/api/ingest/disk-image/drives".to_string(),
            body_json: String::new(),
        };
        let res_drives = handle_ingest_route(&req_drives, &ctx).expect("matched route");
        assert_eq!(res_drives.status_code, 200);
        assert!(res_drives.body_json.contains("\"drives\":"));

        // POST /api/ingest/disk-image/cancel
        let req_cancel = ApiRequest {
            method: "POST".to_string(),
            path: "/api/ingest/disk-image/cancel".to_string(),
            body_json: String::new(),
        };
        let res_cancel = handle_ingest_route(&req_cancel, &ctx).expect("matched route");
        assert_eq!(res_cancel.status_code, 200);
        assert!(res_cancel.body_json.contains("\"status\":\"ok\""));

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
