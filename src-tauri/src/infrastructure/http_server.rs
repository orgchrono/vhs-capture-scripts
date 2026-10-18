//! Native Rust Zero-Dependency HTTP/1.1 & Static Asset Server (`infrastructure::http_server`).
//!
//! Replaces legacy Python FastAPI (`src/vhs_studio/api/server.py`) and `desktop.py`
//! by serving both `/api/*` ViewModel endpoints and `ui/dist` static assets over loopback TCP.

use crate::models::constants::UI_DIST_REL_PATH;
use crate::viewmodels::api_router::{dispatch_api_request, ApiRequest, ApiResponse};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;

/// Parsed incoming HTTP/1.1 request envelope.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpRequest {
    pub method: String,
    pub path: String,
    pub body: String,
}

/// Pure function parsing raw HTTP/1.1 request bytes into an `HttpRequest`.
#[must_use]
pub fn parse_http_request(raw_bytes: &[u8]) -> Option<HttpRequest> {
    let raw_str = std::str::from_utf8(raw_bytes).ok()?;
    let (head, body) = raw_str
        .split_once("\r\n\r\n")
        .or_else(|| raw_str.split_once("\n\n"))
        .unwrap_or((raw_str, ""));

    let first_line = head.lines().next()?;
    let mut parts = first_line.split_whitespace();
    let method = parts.next()?.to_uppercase();
    let full_target = parts.next()?;
    let path = full_target.split('?').next().unwrap_or(full_target).to_string();

    Some(HttpRequest {
        method,
        path,
        body: body.trim_matches('\0').to_string(),
    })
}

/// Pure function resolving Content-Type MIME header from file extension.
#[must_use]
pub fn guess_mime_type(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if lower.ends_with(".js") || lower.ends_with(".mjs") {
        "application/javascript; charset=utf-8"
    } else if lower.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if lower.ends_with(".json") {
        "application/json; charset=utf-8"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".ico") {
        "image/x-icon"
    } else {
        "application/octet-stream"
    }
}

/// Pure path traversal guard preventing directory escape (`..`).
#[must_use]
pub fn is_safe_relative_asset_path(req_path: &str) -> bool {
    !req_path.contains("..") && !req_path.contains('\\') && !req_path.contains('\0')
}

/// Pure function formatting an HTTP/1.1 response with CORS headers for local webview/dev server.
#[must_use]
pub fn format_http_response(status_code: u16, content_type: &str, body: &[u8]) -> Vec<u8> {
    let reason = match status_code {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        500 => "Internal Server Error",
        _ => "OK",
    };

    let header = format!(
        "HTTP/1.1 {status_code} {reason}\r\n\
         Content-Type: {content_type}\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type, X-Session-Token\r\n\
         Connection: close\r\n\r\n",
        body.len()
    );

    let mut packet = Vec::with_capacity(header.len() + body.len());
    packet.extend_from_slice(header.as_bytes());
    packet.extend_from_slice(body);
    packet
}

/// Starts the native Rust HTTP/IPC server on `host:port`.
pub fn run_native_http_server(host: &str, port: u16) -> Result<(), String> {
    let bind_addr = format!("{host}:{port}");
    let listener = TcpListener::bind(&bind_addr)
        .map_err(|e| format!("Failed to bind native server on {bind_addr}: {e}"))?;

    println!("[VHS Studio Native Engine] Listening on http://{bind_addr}");

    for stream_res in listener.incoming() {
        let Ok(mut stream) = stream_res else {
            continue;
        };
        let mut buf = [0u8; 65536];
        let Ok(read_bytes) = stream.read(&mut buf) else {
            continue;
        };
        if read_bytes == 0 {
            continue;
        }

        let Some(req) = parse_http_request(&buf[..read_bytes]) else {
            let resp = format_http_response(400, "application/json", br#"{"error":"bad_request"}"#);
            let _ = stream.write_all(&resp);
            continue;
        };

        if req.method == "OPTIONS" {
            let resp = format_http_response(204, "text/plain", b"");
            let _ = stream.write_all(&resp);
            continue;
        }

        if req.path.starts_with("/api/") {
            let api_req = ApiRequest {
                method: req.method,
                path: req.path,
                body_json: req.body,
            };
            let ApiResponse {
                status_code,
                body_json,
            } = dispatch_api_request(&api_req);
            let resp = format_http_response(
                status_code,
                "application/json; charset=utf-8",
                body_json.as_bytes(),
            );
            let _ = stream.write_all(&resp);
        } else {
            if !is_safe_relative_asset_path(&req.path) {
                let resp = format_http_response(403, "application/json", br#"{"error":"forbidden"}"#);
                let _ = stream.write_all(&resp);
                continue;
            }
            let rel_asset = if req.path == "/" {
                "index.html"
            } else {
                req.path.trim_start_matches('/')
            };
            let asset_path = Path::new(UI_DIST_REL_PATH).join(rel_asset);
            if let Ok(bytes) = fs::read(&asset_path) {
                let mime = guess_mime_type(rel_asset);
                let resp = format_http_response(200, mime, &bytes);
                let _ = stream.write_all(&resp);
            } else {
                let resp = format_http_response(
                    404,
                    "application/json; charset=utf-8",
                    br#"{"error":"UI asset not found"}"#,
                );
                let _ = stream.write_all(&resp);
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_http_request_post_json() {
        let raw = b"POST /api/run?foo=1 HTTP/1.1\r\nHost: localhost:8088\r\nContent-Type: application/json\r\n\r\n{\"preset\":\"gold\"}";
        let req = parse_http_request(raw).expect("valid HTTP request");
        assert_eq!(req.method, "POST");
        assert_eq!(req.path, "/api/run");
        assert_eq!(req.body, "{\"preset\":\"gold\"}");
    }

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
    }
}
