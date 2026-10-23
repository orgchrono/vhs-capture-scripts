//! Queue API Subrouter ViewModel (`viewmodels::api_queue`).
//!
//! Exposes REST endpoints for the persistent batch processing queue:
//! - `GET  /api/queue`
//! - `POST /api/queue/enqueue`
//! - `POST /api/queue/cancel/{id}`
//! - `POST /api/queue/start`
//! - `POST /api/queue/stop`

use crate::infrastructure::app_context::AppContext;
use crate::infrastructure::security::is_safe_media_path;
use crate::viewmodels::api_support::media_dirs;
use crate::viewmodels::api_types::{ApiRequest, ApiResponse};
use serde_json::{json, Value};

/// Handles incoming `/api/queue*` requests. Returns `None` if the path is not matched.
#[must_use]
pub fn handle_queue_route(req: &ApiRequest, ctx: &AppContext) -> Option<ApiResponse> {
    let clean_path = req.clean_path();

    match (req.method.as_str(), clean_path) {
        ("GET", "/api/queue") => Some(handle_get_queue(ctx)),
        ("POST", "/api/queue/enqueue") => Some(handle_enqueue(req, ctx)),
        ("POST", "/api/queue/start") => Some(handle_start_worker(ctx)),
        ("POST", "/api/queue/stop") => Some(handle_stop_worker(ctx)),
        ("POST", path) if path.starts_with("/api/queue/cancel/") => {
            let id_str = &path["/api/queue/cancel/".len()..];
            Some(handle_cancel(id_str, ctx))
        }
        _ => None,
    }
}

fn handle_get_queue(ctx: &AppContext) -> ApiResponse {
    let jobs = ctx.queue.list();
    let stats = ctx.queue.stats();
    let worker_running = ctx.worker.is_running();

    ApiResponse::ok(&json!({
        "jobs": jobs,
        "stats": {
            "pending": stats.pending,
            "processing": stats.processing,
            "running": stats.processing,
            "completed": stats.completed,
            "failed": stats.failed,
            "cancelled": stats.cancelled,
            "total": stats.total,
        },
        "worker_running": worker_running
    }))
}

fn handle_enqueue(req: &ApiRequest, ctx: &AppContext) -> ApiResponse {
    let parsed: Value = match serde_json::from_str(&req.body_json) {
        Ok(v) => v,
        Err(e) => return ApiResponse::error(400, &format!("Invalid JSON payload: {e}")),
    };

    let input = parsed
        .get("input")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if input.is_empty() {
        return ApiResponse::error(400, "Missing required field 'input'");
    }

    let dirs = media_dirs();
    if !is_safe_media_path(input, &dirs.roots()) {
        return ApiResponse::error(400, "Invalid or insecure file path.");
    }

    let params = parsed.get("params").cloned().unwrap_or_else(|| json!({}));
    let priority = parsed
        .get("priority")
        .and_then(Value::as_i64)
        .map(|v| v as i32)
        .unwrap_or(0);

    match ctx.queue.enqueue(input, params, priority) {
        Ok(job_id) => ApiResponse::ok(&json!({
            "status": "ok",
            "job_id": job_id,
            "message": format!("Job #{job_id} enqueued.")
        })),
        Err(e) => ApiResponse::error(500, &format!("Failed to persist queue job: {e}")),
    }
}

fn handle_cancel(id_str: &str, ctx: &AppContext) -> ApiResponse {
    let job_id: u64 = match id_str.parse() {
        Ok(id) => id,
        Err(_) => return ApiResponse::error(400, "Invalid job ID in path"),
    };

    match ctx.queue.cancel(job_id) {
        Ok(()) => ApiResponse::ok(&json!({
            "status": "ok",
            "message": format!("Job #{job_id} cancelled.")
        })),
        Err(e) => ApiResponse::error(400, &format!("Job could not be cancelled: {e}")),
    }
}

fn handle_start_worker(ctx: &AppContext) -> ApiResponse {
    ctx.worker.start();
    ApiResponse::ok(&json!({
        "status": "ok",
        "message": "Queue worker started."
    }))
}

fn handle_stop_worker(ctx: &AppContext) -> ApiResponse {
    ctx.worker.stop();
    ApiResponse::ok(&json!({
        "status": "ok",
        "message": "Queue worker stopped."
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::app_context::AppContext;

    #[test]
    fn test_queue_endpoints_roundtrip() {
        let tmp = std::env::temp_dir().join(format!("vhs_queue_vm_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&tmp);
        let ctx = AppContext::new_test(&tmp);

        let get_req = ApiRequest {
            method: "GET".to_string(),
            path: "/api/queue".to_string(),
            body_json: String::new(),
        };
        let res = handle_queue_route(&get_req, &ctx).expect("matched route");
        assert_eq!(res.status_code, 200);
        assert!(res.body_json.contains("\"total\":0"));

        let start_req = ApiRequest {
            method: "POST".to_string(),
            path: "/api/queue/start".to_string(),
            body_json: String::new(),
        };
        let start_res = handle_queue_route(&start_req, &ctx).expect("matched route");
        assert_eq!(start_res.status_code, 200);
        assert!(start_res.body_json.contains("Queue worker started."));

        let stop_req = ApiRequest {
            method: "POST".to_string(),
            path: "/api/queue/stop".to_string(),
            body_json: String::new(),
        };
        let stop_res = handle_queue_route(&stop_req, &ctx).expect("matched route");
        assert_eq!(stop_res.status_code, 200);
        assert!(stop_res.body_json.contains("Queue worker stopped."));
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
