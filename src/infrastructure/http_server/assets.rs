use crate::infrastructure::http_codec::{format_http_response, guess_mime_type, is_safe_relative_asset_path};
use std::fs;
use std::io::Write;
use std::net::TcpStream;

pub fn serve_static_asset(
    mut stream: TcpStream,
    path: &str,
    origin: Option<&str>,
) {
    if !is_safe_relative_asset_path(path) {
        let resp = format_http_response(403, "application/json", br#"{"error":"forbidden"}"#, None);
        let _ = stream.write_all(&resp);
        return;
    }

    let rel_asset = if path == "/" {
        "index.html"
    } else {
        path.trim_start_matches('/')
    };

    let dist_root = crate::infrastructure::paths::resolve_ui_dist_dir();
    let asset_path = dist_root.join(rel_asset);

    // 1. Check disk file first (supports dev hot-reloading)
    if asset_path.is_file() {
        if let Ok(bytes) = fs::read(&asset_path) {
            let mime = guess_mime_type(rel_asset);
            let resp = format_http_response(200, mime, &bytes, origin);
            let _ = stream.write_all(&resp);
            return;
        }
    }

    // 2. Check embedded assets compiled directly into the binary
    if let Some((bytes, mime)) = crate::infrastructure::embedded_assets::get_embedded_ui_asset(rel_asset) {
        let resp = format_http_response(200, mime, bytes, origin);
        let _ = stream.write_all(&resp);
        return;
    }

    // 3. Fallback to index.html for Single Page Applications (React Router)
    let index_path = dist_root.join("index.html");
    if index_path.is_file() {
        if let Ok(bytes) = fs::read(&index_path) {
            let resp = format_http_response(200, "text/html; charset=utf-8", &bytes, origin);
            let _ = stream.write_all(&resp);
            return;
        }
    }

    if let Some((bytes, mime)) = crate::infrastructure::embedded_assets::get_embedded_ui_asset("index.html") {
        let resp = format_http_response(200, mime, bytes, origin);
        let _ = stream.write_all(&resp);
        return;
    }

    let resp = format_http_response(
        404,
        "application/json; charset=utf-8",
        br#"{"error":"UI asset not found"}"#,
        origin,
    );
    let _ = stream.write_all(&resp);
}
