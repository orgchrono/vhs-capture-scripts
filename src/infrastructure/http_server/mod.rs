//! Native Rust Multi-Threaded HTTP/1.1 & Static Asset Server (`infrastructure::http_server`).
//!
//! Replaces legacy Python FastAPI (`src/vhs_studio/api/server.py`) and `desktop.py`
//! by serving `/api/*` ViewModel endpoints, Server-Sent Events (SSE) log streaming,
//! and `ui/dist` static assets over loopback TCP with strict security enforcement.

pub mod assets;
pub mod browser;
pub mod connection;
pub mod sse;
pub mod stream_proxy;

pub use browser::launch_default_browser;
pub(crate) use connection::handle_connection;

use crate::infrastructure::app_context::AppContext;
use std::net::TcpListener;
use std::sync::Arc;
use std::thread;

/// Starts the native multi-threaded Rust HTTP/IPC server on `host:port`.
pub fn run_native_http_server(host: &str, port: u16, open_browser: bool) -> Result<(), String> {
    let ctx = Arc::new(crate::viewmodels::api_router::default_app_context().clone());
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
    use crate::infrastructure::http_codec::{guess_mime_type, is_safe_relative_asset_path};
    use crate::process_manager::ProcessManager;

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

    #[test]
    fn test_sse_cursor_streams_past_ring_capacity_without_stalling() {
        // Simulates the exact bug where log ring capacity was 500 lines and SSE previously stalled
        // at line 500 (frame 63750, 73%) because it used current_logs.len() > cursor.
        let pm = ProcessManager::default();
        // Append 600 lines (more than 500 capacity)
        for i in 1..=600 {
            pm.append_log(format!("PROGRESS: frame {i}"));
        }
        let mut cursor = 0u64;
        let mut collected = Vec::new();
        // First batch
        let (batch1, next_cursor) = pm.logs_since(cursor);
        cursor = next_cursor;
        collected.extend(batch1);
        // Append 100 more
        for i in 601..=700 {
            pm.append_log(format!("PROGRESS: frame {i}"));
        }
        let (batch2, next_cursor2) = pm.logs_since(cursor);
        cursor = next_cursor2;
        assert_eq!(batch2.len(), 100);
        assert_eq!(batch2.last().unwrap(), "PROGRESS: frame 700");
        collected.extend(batch2);

        assert_eq!(cursor, 700);
    }
}
