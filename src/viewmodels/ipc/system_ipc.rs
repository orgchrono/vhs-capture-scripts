//! Tauri IPC Command Handlers: System, Hardware, Preferences, and Filesystem.

use std::path::Path;
use serde_json::{json, Value};
use crate::infrastructure::hardware::{HardwareAssessment, HardwareSpecs};
use crate::infrastructure::lock::LockDecision;
use crate::models::config::AdvancedConfig;
use crate::models::preferences::AppPreferences;

#[tauri::command]
pub fn ipc_assess_hardware(specs: HardwareSpecs) -> HardwareAssessment {
    crate::viewmodels::system_vm::ipc_assess_hardware(&specs)
}

#[tauri::command]
pub fn ipc_calculate_optimal_tile_size(vram_gb: f32) -> u32 {
    crate::viewmodels::restoration_vm::ipc_calculate_optimal_tile_size(vram_gb)
}

#[tauri::command]
pub fn ipc_get_ffmpeg_install_command(mgr_name: String) -> Option<Vec<String>> {
    crate::viewmodels::system_vm::ipc_get_ffmpeg_install_command(&mgr_name)
}

#[tauri::command]
pub fn ipc_evaluate_lock_decision(
    existing_pid: Option<u32>,
    is_existing_active: bool,
    current_pid: u32,
) -> String {
    match crate::viewmodels::system_vm::ipc_evaluate_lock_decision(
        existing_pid,
        is_existing_active,
        current_pid,
    ) {
        LockDecision::Acquired => "acquired".to_string(),
        LockDecision::Blocked(_) => "blocked".to_string(),
        LockDecision::AlreadyOwned => "alreadyowned".to_string(),
    }
}

#[tauri::command]
pub fn ipc_parse_advanced_toml(toml_content: String) -> AdvancedConfig {
    crate::viewmodels::system_vm::ipc_parse_advanced_toml(&toml_content)
}

#[tauri::command]
pub fn ipc_resolve_tool_path(
    tool_name: String,
    project_root: Option<String>,
    user_home: Option<String>,
) -> Option<String> {
    crate::viewmodels::system_vm::ipc_resolve_tool_path(
        &tool_name,
        project_root.as_deref(),
        user_home.as_deref(),
    )
}

#[tauri::command]
pub fn ipc_verify_binary_integrity(
    binary_filename: String,
    actual_sha256: String,
    platform_key: String,
    manifest_json: String,
) -> (bool, String) {
    crate::viewmodels::system_vm::ipc_verify_binary_integrity(
        &binary_filename,
        &actual_sha256,
        &platform_key,
        &manifest_json,
    )
}

#[tauri::command]
pub fn ipc_format_binary_name(base_name: String) -> String {
    crate::viewmodels::system_vm::ipc_format_binary_name(&base_name)
}

#[tauri::command]
pub fn ipc_check_ffmpeg_capability(output_text: String, name: String, is_filter: bool) -> bool {
    crate::viewmodels::system_vm::ipc_check_ffmpeg_capability(&output_text, &name, is_filter)
}

#[tauri::command]
pub fn ipc_parse_preferences(json_content: String) -> AppPreferences {
    crate::viewmodels::system_vm::ipc_parse_preferences(&json_content)
}

#[tauri::command]
pub fn ipc_get_preferences() -> Value {
    let prefs = crate::viewmodels::api_support::load_preferences();
    crate::models::preferences::to_ui_json(&prefs)
}

#[tauri::command]
pub fn ipc_save_preferences(preferences: Value) -> Result<Value, String> {
    let current = crate::viewmodels::api_support::load_preferences();
    let merged = crate::models::preferences::merge_preferences(&current, &preferences);
    crate::viewmodels::api_support::save_preferences(&merged)?;
    Ok(json!({
        "success": true,
        "preferences": crate::models::preferences::to_ui_json(&merged)
    }))
}

#[tauri::command]
pub fn ipc_browse_filesystem(path: Option<String>) -> crate::infrastructure::fs_browser::FsBrowseResult {
    crate::infrastructure::fs_browser::browse_filesystem(path.as_deref())
}

#[tauri::command]
pub fn ipc_pick_folder(initial_path: Option<String>) -> Option<String> {
    let p = initial_path.as_deref().map(Path::new);
    crate::infrastructure::fs_browser::pick_folder_native(p)
        .map(|buf| buf.to_string_lossy().to_string())
}
