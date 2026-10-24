//! Native Rust Multi-Threaded HTTP/1.1 & Static Asset Server (`infrastructure::http_server`).
//!
//! Replaces legacy Python FastAPI (`src/vhs_studio/api/server.py`) and `desktop.py`
//! by serving `/api/*` ViewModel endpoints, Server-Sent Events (SSE) log streaming,
//! and `ui/dist` static assets over loopback TCP with strict security enforcement.

use crate::infrastructure::app_context::AppContext;
use crate::infrastructure::http_codec::{
    find_head_end, format_http_response, format_sse_event, format_sse_head,
    format_stream_proxy_head, guess_mime_type, is_safe_relative_asset_path, parse_http_request,
    parse_request_head,
};
use crate::infrastructure::security::{is_safe_media_path, verify_api_request, SecurityVerdict};
use crate::models::constants::{DEFAULT_STREAM_PROXY_FPS, HTTP_READ_TIMEOUT_SECS, MAX_HTTP_BODY_BYTES};
use crate::viewmodels::api_router::{dispatch_api_request_with_context, ApiRequest, ApiResponse};
use crate::viewmodels::api_support::media_dirs;
use serde_json::json;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

/// Helper to launch the default system browser pointing to the server URL.
pub fn launch_default_browser(url: &str) {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/c", "start", url])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}

/// Reads a complete HTTP/1.1 request head + body (respecting `Content-Length`).
fn read_complete_request(stream: &mut TcpStream) -> Result<Vec<u8>, ()> {
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

fn handle_sse_stream(
    mut stream: TcpStream,
    ctx: &AppContext,
    allow_origin: Option<&str>,
) -> Result<(), ()> {
    let _ = stream.set_read_timeout(None);
    let head = format_sse_head(allow_origin);
    stream.write_all(&head).map_err(|_| ())?;

    let mut cursor = 0usize;
    loop {
        let snapshot = ctx.process.snapshot();
        let current_logs = ctx.process.logs();

        if current_logs.len() > cursor {
            let new_lines = &current_logs[cursor..];
            cursor = current_logs.len();
            for line in new_lines {
                let event_json = json!({
                    "line": line,
                    "running": snapshot.running,
                    "paused": snapshot.paused,
                    "exit_code": snapshot.last_exit_code,
                    "success": snapshot.last_success
                })
                .to_string();
                let event = format_sse_event(&event_json);
                if stream.write_all(event.as_bytes()).is_err() {
                    return Ok(()); // Client disconnected
                }
            }
            let _ = stream.flush();
        }

        if !snapshot.running && cursor >= current_logs.len() {
            // Heartbeat / final state
            let done_event = format_sse_event(
                &json!({
                    "running": false,
                    "paused": false,
                    "exit_code": snapshot.last_exit_code,
                    "success": snapshot.last_success
                })
                .to_string(),
            );
            let _ = stream.write_all(done_event.as_bytes());
            let _ = stream.flush();
            thread::sleep(Duration::from_millis(500));
            break;
        }

        thread::sleep(Duration::from_millis(150));
    }

    Ok(())
}

fn handle_stream_proxy(
    mut stream: TcpStream,
    target: &str,
    allow_origin: Option<&str>,
) -> Result<(), ()> {
    let _ = stream.set_read_timeout(None);
    let source_param =
        crate::infrastructure::http_codec::query_param(target, "source").unwrap_or_default();
    let mode_param =
        crate::infrastructure::http_codec::query_param(target, "mode").unwrap_or_default();
    let fps_param: u32 = crate::infrastructure::http_codec::query_param(target, "fps")
        .and_then(|f| f.parse().ok())
        .unwrap_or(DEFAULT_STREAM_PROXY_FPS);
    let time_param: f64 = crate::infrastructure::http_codec::query_param(target, "timestamp")
        .and_then(|t| t.parse::<f64>().ok())
        .unwrap_or(0.0)
        .max(0.0);

    let dirs = media_dirs();
    let valid_source = if !source_param.is_empty() {
        let resolved = crate::viewmodels::api_support::resolve_media_input(&source_param, &dirs)
            .unwrap_or(source_param);
        let p = Path::new(&resolved);
        if is_safe_media_path(&resolved, &dirs.roots()) && p.is_file() {
            Some(resolved)
        } else {
            None
        }
    } else {
        None
    };

    let restored_master = valid_source.as_ref().and_then(|src| {
        let search_dirs = [dirs.restored.clone(), dirs.work.clone()];
        let raw_dirs = [dirs.raw.clone(), dirs.media.clone()];
        let check = crate::infrastructure::job_recovery::check_existing_restoration(
            Path::new(src),
            &search_dirs,
            &raw_dirs,
            &dirs.restored,
        );
        if check.has_existing && check.r#type.as_deref() == Some("completed") {
            check.file_path
        } else {
            None
        }
    });

    let mode = crate::domain::stream::StreamProxyMode::from_str_opt(&mode_param);
    let spec = crate::domain::stream::StreamProxySpec {
        source_path: valid_source,
        restored_master_path: restored_master,
        mode,
        fps: fps_param,
        timestamp_sec: time_param,
    };

    let ffmpeg_bin =
        crate::infrastructure::toolchain::resolve_executable_path("ffmpeg", None, None)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "ffmpeg".to_string());

    let cmd_args = crate::domain::stream::build_stream_proxy_ffmpeg_args(&spec, &ffmpeg_bin);

    let head = format_stream_proxy_head(allow_origin);
    if stream.write_all(&head).is_err() {
        return Ok(());
    }
    let _ = stream.flush();

    let mut cmd =
        crate::infrastructure::toolchain::create_silent_command(Path::new(&cmd_args[0]));
    cmd.args(&cmd_args[1..]);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::null());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(_) => return Err(()),
    };

    let mut stdout = match child.stdout.take() {
        Some(s) => s,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(());
        }
    };

    let mut buffer = [0u8; 16384];
    loop {
        match stdout.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => {
                if stream.write_all(&buffer[..n]).is_err() || stream.flush().is_err() {
                    break;
                }
            }
            Err(_) => break,
        }
    }

    let _ = child.kill();
    let _ = child.wait();
    Ok(())
}

fn handle_connection(mut stream: TcpStream, ctx: &AppContext) {
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
        .map(|(_, v)| v.as_str());

    if req.method == "OPTIONS" {
        let resp = format_http_response(204, "text/plain", b"", origin);
        let _ = stream.write_all(&resp);
        return;
    }

    // SSE Log Streaming endpoint
    if req.path == "/api/logs/stream" {
        let _ = handle_sse_stream(stream, ctx, origin);
        return;
    }

    // API routing
    if req.path.starts_with("/api/") {
        // Enforce loopback and session token security (exempt /api/token for bootstrapping)
        if req.path != "/api/token" {
            match verify_api_request(&req.method, &req.headers, &ctx.session_token) {
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
    if !is_safe_relative_asset_path(&req.path) {
        let resp = format_http_response(403, "application/json", br#"{"error":"forbidden"}"#, None);
        let _ = stream.write_all(&resp);
        return;
    }

    let rel_asset = if req.path == "/" {
        "index.html"
    } else {
        req.path.trim_start_matches('/')
    };

    let dist_root = crate::infrastructure::paths::resolve_ui_dist_dir();
    let asset_path = dist_root.join(rel_asset);

    if asset_path.is_file() {
        if let Ok(bytes) = fs::read(&asset_path) {
            let mime = guess_mime_type(rel_asset);
            let resp = format_http_response(200, mime, &bytes, origin);
            let _ = stream.write_all(&resp);
            return;
        }
    }

    // Fallback to index.html for Single Page Applications (React Router)
    let index_path = dist_root.join("index.html");
    if index_path.is_file() {
        if let Ok(bytes) = fs::read(&index_path) {
            let resp = format_http_response(200, "text/html; charset=utf-8", &bytes, origin);
            let _ = stream.write_all(&resp);
            return;
        }
    }

    let resp = format_http_response(
        404,
        "application/json; charset=utf-8",
        br#"{"error":"UI asset not found"}"#,
        origin,
    );
    let _ = stream.write_all(&resp);
}

/// Starts the native multi-threaded Rust HTTP/IPC server on `host:port`.
pub fn run_native_http_server(host: &str, port: u16, open_browser: bool) -> Result<(), String> {
    let ctx = Arc::new(AppContext::default_runtime());
    run_native_http_server_with_context(host, port, open_browser, ctx)
}

/// Starts the server with an explicitly injected `AppContext`.
pub fn run_native_http_server_with_context(
    host: &str,
    port: u16,
    open_browser: bool,
    ctx: Arc<AppContext>,
) -> Result<(), String> {
    let bind_addr = format!("{host}:{port}");
    let listener = TcpListener::bind(&bind_addr)
        .map_err(|e| format!("Failed to bind native server on {bind_addr}: {e}"))?;

    println!("[VHS Studio Native Engine] Listening on http://{bind_addr}");
    if open_browser {
        let app_url = format!("http://{bind_addr}");
        launch_default_browser(&app_url);
    }

    for stream_res in listener.incoming() {
        let stream = match stream_res {
            Ok(s) => s,
            Err(_) => continue,
        };

        let ctx_clone = Arc::clone(&ctx);
        thread::spawn(move || {
            handle_connection(stream, &ctx_clone);
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_safe_relative_asset_path_blocks_traversal() {
        assert!(is_safe_relative_asset_path("/assets/index.js"));
        assert!(!is_safe_relative_asset_path("/../secrets.toml"));
        assert!(!is_safe_relative_asset_path("/assets\\evil.js"));
    }

    #[test]
    fn test_guess_mime_type_resolution() {
        assert_eq!(guess_mime_type("index.html"), "text/html; charset=utf-8");
        assert_eq!(
            guess_mime_type("assets/app.js"),
            "application/javascript; charset=utf-8"
        );
        assert_eq!(guess_mime_type("style.css"), "text/css; charset=utf-8");
        assert_eq!(guess_mime_type("cover.jpg"), "image/jpeg");
    }
}
