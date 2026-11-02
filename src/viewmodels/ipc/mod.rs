//! Typed Tauri v2 IPC Command Handlers.
//!
//! Provides `#[tauri::command]` entrypoints bridging the React UI running
//! inside OS WebView (WebView2 on Windows, WebKitGTK on Linux, WKWebView on macOS)
//! with the pure Rust functional core.

pub mod system_ipc;
pub mod restoration_ipc;
pub mod ingest_ipc;
pub mod storage_ipc;

pub use system_ipc::*;
pub use restoration_ipc::*;
pub use ingest_ipc::*;
pub use storage_ipc::*;

use crate::models::presets::RestorationPreset;

#[must_use]
pub fn parse_preset(preset: &str) -> RestorationPreset {
    match preset.to_ascii_lowercase().as_str() {
        "gold" => RestorationPreset::Gold,
        "speed" => RestorationPreset::Speed,
        "tbc_hold" | "tbchold" => RestorationPreset::TbcHold,
        "ai_master" | "aimaster" => RestorationPreset::AiMaster,
        _ => RestorationPreset::Custom,
    }
}
