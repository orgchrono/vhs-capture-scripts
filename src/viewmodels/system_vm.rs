//! System, Hardware, Toolchain & Preferences ViewModel (`viewmodels::system_vm`).
//!
//! Exposes typed Tauri IPC commands for hardware assessment, encoder selection,
//! package manager resolution, binary path & SHA-256 integrity checks,
//! application preferences, advanced TOML parsing, and 10-locale i18n validation.

use crate::infrastructure::hardware::{
    assess_hardware, resolve_optimal_encoder_args, GpuType, HardwareAssessment, HardwareSpecs,
};
use crate::infrastructure::i18n_validator::{validate_locales_directory, I18nValidationSummary};
use crate::infrastructure::lock::{
    evaluate_lock_decision, format_lock_content, parse_lock_pid, LockDecision,
};
use crate::infrastructure::package::{
    get_ffmpeg_install_command, has_ffmpeg_encoder, has_ffmpeg_filter, PackageManager,
};
use crate::infrastructure::toolchain::{
    check_ffmpeg_encoder_in_output, check_ffmpeg_filter_in_output, format_binary_name,
    resolve_executable_path, verify_binary_integrity,
};
use crate::models::config::{parse_advanced_toml, AdvancedConfig};
use crate::models::preferences::{
    parse_preferences_json, validate_and_clamp_preferences, AppPreferences,
};

/// Typed IPC ViewModel command evaluating hardware specifications into an operational tier.
#[must_use]
pub fn ipc_assess_hardware(specs: &HardwareSpecs) -> HardwareAssessment {
    assess_hardware(specs)
}

/// Typed IPC ViewModel command resolving optimal encoder arguments.
#[must_use]
pub fn ipc_resolve_encoder_args(
    preference: &str,
    platform: &str,
    gpu_type: &GpuType,
) -> Vec<String> {
    resolve_optimal_encoder_args(preference, platform, gpu_type)
}

/// Typed IPC ViewModel command resolving FFmpeg install command for package manager.
#[must_use]
pub fn ipc_get_ffmpeg_install_command(mgr_name: &str) -> Option<Vec<String>> {
    let mgr = PackageManager::from_name(mgr_name);
    get_ffmpeg_install_command(&mgr)
}

/// Typed IPC ViewModel command verifying encoder presence in FFmpeg.
#[must_use]
pub fn ipc_has_ffmpeg_encoder(encoders_output: &str, encoder_name: &str) -> bool {
    has_ffmpeg_encoder(encoders_output, encoder_name)
}

/// Typed IPC ViewModel command verifying filter presence in FFmpeg.
#[must_use]
pub fn ipc_has_ffmpeg_filter(filters_output: &str, filter_name: &str) -> bool {
    has_ffmpeg_filter(filters_output, filter_name)
}

/// Typed IPC ViewModel command parsing preferences JSON with dual-casing support and clamping.
#[must_use]
pub fn ipc_parse_preferences(json_content: &str) -> AppPreferences {
    parse_preferences_json(json_content)
}

/// Typed IPC ViewModel command validating and clamping preferences.
#[must_use]
pub fn ipc_validate_preferences(prefs: AppPreferences) -> AppPreferences {
    validate_and_clamp_preferences(prefs)
}

/// Typed IPC ViewModel command parsing PID from lock file.
#[must_use]
pub fn ipc_parse_lock_pid(content: &str) -> Option<u32> {
    parse_lock_pid(content)
}

/// Typed IPC ViewModel command evaluating lock decision.
#[must_use]
pub fn ipc_evaluate_lock_decision(
    existing_pid: Option<u32>,
    is_existing_active: bool,
    current_pid: u32,
) -> LockDecision {
    evaluate_lock_decision(existing_pid, is_existing_active, current_pid)
}

/// Typed IPC ViewModel command formatting lock content string.
#[must_use]
pub fn ipc_format_lock_content(pid: u32, label: &str) -> String {
    format_lock_content(pid, label)
}

/// Typed IPC ViewModel command parsing advanced TOML configuration.
#[must_use]
pub fn ipc_parse_advanced_toml(toml_content: &str) -> AdvancedConfig {
    parse_advanced_toml(toml_content)
}

/// Typed IPC ViewModel command resolving binary path on host system.
#[must_use]
pub fn ipc_resolve_tool_path(
    tool_name: &str,
    project_root: Option<&str>,
    user_home: Option<&str>,
) -> Option<String> {
    let root = project_root.map(std::path::Path::new);
    let home = user_home.map(std::path::Path::new);
    resolve_executable_path(tool_name, root, home).map(|p| p.to_string_lossy().to_string())
}

/// Typed IPC ViewModel command verifying SHA-256 fixity of a binary against checksums manifest.
#[must_use]
pub fn ipc_verify_binary_integrity(
    binary_filename: &str,
    actual_sha256: &str,
    platform_key: &str,
    manifest_json: &str,
) -> (bool, String) {
    verify_binary_integrity(
        binary_filename,
        actual_sha256,
        platform_key,
        manifest_json,
    )
}

/// Typed IPC ViewModel command formatting binary name with platform extension (.exe).
#[must_use]
pub fn ipc_format_binary_name(base_name: &str) -> String {
    format_binary_name(base_name)
}

/// Typed IPC ViewModel command checking if encoder or filter exists in ffmpeg capability text.
#[must_use]
pub fn ipc_check_ffmpeg_capability(output_text: &str, name: &str, is_filter: bool) -> bool {
    if is_filter {
        check_ffmpeg_filter_in_output(output_text, name)
    } else {
        check_ffmpeg_encoder_in_output(output_text, name)
    }
}

/// Typed IPC ViewModel command validating 10-locale i18n parity in `locales_dir`.
pub fn ipc_validate_i18n_locales(locales_dir: &str) -> Result<I18nValidationSummary, String> {
    validate_locales_directory(std::path::Path::new(locales_dir))
}
