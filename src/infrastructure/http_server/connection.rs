use crate::infrastructure::app_context::AppContext;
use crate::infrastructure::http_codec::{
    find_head_end, format_http_response, parse_http_request, parse_request_head,
};
use crate::infrastructure::security::{is_safe_media_path, verify_api_request, SecurityVerdict};
use crate::models::constants::{HTTP_READ_TIMEOUT_SECS, MAX_HTTP_BODY_BYTES};
use crate::viewmodels::api_router::{dispatch_api_request_with_context, ApiRequest, ApiResponse};
use crate::viewmodels::api_support::media_dirs;
use super::assets::serve_static_asset;
use super::sse::handle_sse_stream;
use super::stream_proxy::handle_stream_proxy;
use serde_json::json;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::time::Duration;

/// Reads a complete HTTP/1.1 request head + body (respecting `Content-Length`).
pub(crate) fn read_complete_request(stream: &mut TcpStream) -> Result<Vec<u8>, ()> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(HTTP_READ_TIMEOUT_SECS)));
    let mut buffer = Vec::with_capacity(4096);
    let mut chunk = [0u8; 4096];

    // Read until header boundary
    let head_end = loop {
        let n = stream.read(&mut chunk).map_err(|_| ())?;
        if n == 0 {
            return Err(());
        }
        buffer.extend_from_slice(&chunk[..n]);
        if let Some(pos) = find_head_end(&buffer) {
            break pos;
        }
        if buffer.len() > 65536 {
            return Err(()); // Header block too large
        }
    };

    let head_str = match std::str::from_utf8(&buffer[..head_end]) {
        Ok(s) => s,
        Err(_) => return Err(()),
    };

    let head = match parse_request_head(head_str) {
        Some(h) => h,
        None => return Err(()),
    };

    if head.content_length > MAX_HTTP_BODY_BYTES {
        return Err(()); // Payload too large
    }

    let required_total = head_end + head.content_length;
    while buffer.len() < required_total {
        let n = stream.read(&mut chunk).map_err(|_| ())?;
        if n == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..n]);
    }

    Ok(buffer)
}

pub fn handle_connection(mut stream: TcpStream, ctx: &AppContext) {
    let raw_bytes = match read_complete_request(&mut stream) {
        Ok(b) => b,
        Err(_) => {
            let resp = format_http_response(
                400,
                "application/json",
                br#"{"error":"Bad Request"}"#,
                None,
            );
            let _ = stream.write_all(&resp);
            return;
        }
    };

    let req = match parse_http_request(&raw_bytes) {
        Some(r) => r,
        None => {
            let resp = format_http_response(
                400,
                "application/json",
                br#"{"error":"Bad Request"}"#,
                None,
            );
            let _ = stream.write_all(&resp);
            return;
        }
    };

    let origin = req
        .headers
        .iter()
        .find(|(k, _)| k == "origin")
        .map(|(_, v)| v.as_str())
        .filter(|o| crate::infrastructure::security::is_origin_allowed(o));

    if req.method == "OPTIONS" {
        let resp = format_http_response(204, "text/plain", b"", origin);
        let _ = stream.write_all(&resp);
        return;
    }

    // API routing
    if req.path.starts_with("/api/") {
        // Enforce loopback and session token security (exempt /api/token and /api/logs/stream from token header, still enforce Host)
        let expected_token = if req.path == "/api/token" || req.path == "/api/logs/stream" {
            ""
        } else {
            &ctx.session_token
        };
        match verify_api_request(&req.method, &req.headers, expected_token) {
            SecurityVerdict::Allow => {}
            SecurityVerdict::Deny { status, error } => {
                let err_body = json!({ "status": "error", "error": error }).to_string();
                let resp = format_http_response(
                    status,
                    "application/json; charset=utf-8",
                    err_body.as_bytes(),
                    origin,
                );
                let _ = stream.write_all(&resp);
                return;
            }
        }

        // SSE Log Streaming endpoint
        if req.path == "/api/logs/stream" {
            let _ = handle_sse_stream(stream, ctx, origin);
            return;
        }

        // Thumbnail endpoint (raw binary JPEG)
        if req.path == "/api/media/thumbnail" {
            let p = crate::infrastructure::http_codec::query_param(&req.target(), "path")
                .unwrap_or_default();
            let dirs = media_dirs();
            let resolved = crate::viewmodels::api_support::resolve_media_input(&p, &dirs).unwrap_or(p);
            if is_safe_media_path(&resolved, &dirs.roots()) && Path::new(&resolved).is_file() {
                let ffmpeg = crate::infrastructure::toolchain::resolve_executable_path("ffmpeg", None, None);
                if let Some(bytes) = crate::infrastructure::thumbnail::get_or_generate_thumbnail(
                    Path::new(&resolved),
                    ffmpeg.as_deref(),
                ) {
                    let resp = format_http_response(200, "image/jpeg", &bytes, origin);
                    let _ = stream.write_all(&resp);
                    return;
                }
            }
            let resp = format_http_response(
                404,
                "application/json",
                br#"{"error":"Thumbnail not found"}"#,
                origin,
            );
            let _ = stream.write_all(&resp);
            return;
        }

        // Live restoration frame endpoint (raw binary JPEG)
        if req.path == "/api/monitor/live-restoration-frame" {
            let dirs = media_dirs();
            let live_frame_path = dirs.work.join("live_frame.jpg");
            if live_frame_path.is_file() {
                if let Ok(bytes) = fs::read(&live_frame_path) {
                    if bytes.len() > 100 {
                        let resp = format_http_response(200, "image/jpeg", &bytes, origin);
                        let _ = stream.write_all(&resp);
                        return;
                    }
                }
            }
            let resp = format_http_response(204, "image/jpeg", &[], origin);
            let _ = stream.write_all(&resp);
            return;
        }

        // Streaming proxy endpoint (multipart/x-mixed-replace MJPEG)
        if req.path == "/api/monitor/stream-proxy" {
            let _ = handle_stream_proxy(stream, &req.target(), origin);
            return;
        }

        let api_req = ApiRequest {
            path: req.target(),
            method: req.method,
            body_json: req.body,
        };
        let ApiResponse {
            status_code,
            body_json,
        } = dispatch_api_request_with_context(&api_req, ctx);
        let resp = format_http_response(
            status_code,
            "application/json; charset=utf-8",
            body_json.as_bytes(),
            origin,
        );
        let _ = stream.write_all(&resp);
        return;
    }

    // Static asset serving with SPA routing fallback
    serve_static_asset(stream, &req.path, origin);
}
