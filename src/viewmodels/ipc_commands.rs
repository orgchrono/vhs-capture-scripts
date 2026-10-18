//! Typed Tauri v2 IPC Command Handlers.
//!
//! Provides `#[tauri::command]` entrypoints bridging the React UI running
//! inside OS WebView (WebView2 on Windows, WebKitGTK on Linux, WKWebView on macOS)
//! with the pure Rust functional core.

use crate::infrastructure::executor::{PlannedRestoration, RestorationSummary};
use crate::infrastructure::probe::MediaProbeResult;

/// Typed IPC command directly probing a media file via FFprobe on disk.
#[tauri::command]
pub fn ipc_probe_media_file(
    file_path: String,
    ffprobe_binary: String,
) -> Result<MediaProbeResult, String> {
    crate::viewmodels::ingest_vm::ipc_probe_media_file(&file_path, &ffprobe_binary)
}

/// Typed IPC command executing a planned restoration job natively.
#[tauri::command]
pub fn ipc_execute_restoration_job(
    planned: PlannedRestoration,
) -> Result<RestorationSummary, String> {
    crate::viewmodels::restoration_vm::ipc_execute_restoration_job(planned, None)
}

/// Initializes and starts the native desktop window using the OS WebView.
pub fn run_desktop_app() {
    // Start the local HTTP micro-server in background for REST/SSE endpoints
    std::thread::spawn(|| {
        let _ = crate::infrastructure::http_server::run_native_http_server(
            crate::models::constants::DEFAULT_API_HOST,
            crate::models::constants::DEFAULT_API_PORT,
        );
    });

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ipc_probe_media_file,
            ipc_execute_restoration_job,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
