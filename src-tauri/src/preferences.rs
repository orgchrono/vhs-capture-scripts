//! Global Program Preferences & UI Settings SSOT.
//!
//! Pure functional deserialization with dual camelCase/snake_case alias support,
//! boundary validation, range clamping, and canonical default factory.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppPreferences {
    #[serde(default, alias = "rawDir")]
    pub raw_dir: String,

    #[serde(default, alias = "restoredDir")]
    pub restored_dir: String,

    #[serde(default, alias = "cacheDir")]
    pub cache_dir: String,

    #[serde(default = "default_true", alias = "livePreviewEnabled")]
    pub live_preview_enabled: bool,

    #[serde(default = "default_preview_fps", alias = "previewFps")]
    pub preview_fps: u32,

    #[serde(default, alias = "verboseConsole")]
    pub verbose_console: bool,

    #[serde(default = "default_true", alias = "autoScrollConsole")]
    pub auto_scroll_console: bool,

    #[serde(default = "default_max_console_lines", alias = "maxConsoleLines")]
    pub max_console_lines: u32,

    #[serde(default = "default_true", alias = "panasonicHotplugEnabled")]
    pub panasonic_hotplug_enabled: bool,

    #[serde(default = "default_panasonic_poll_interval_ms", alias = "panasonicPollIntervalMs")]
    pub panasonic_poll_interval_ms: u32,

    #[serde(default = "default_auto", alias = "preferredAiDevice")]
    pub preferred_ai_device: String,

    #[serde(default = "default_whisper_max_threads", alias = "whisperMaxThreads")]
    pub whisper_max_threads: u32,

    #[serde(default = "default_auto", alias = "hardwareEncoderPreference")]
    pub hardware_encoder_preference: String,

    #[serde(default, alias = "highContrast")]
    pub high_contrast: bool,

    #[serde(default, alias = "largeText")]
    pub large_text: bool,

    #[serde(default = "default_dark", alias = "theme")]
    pub theme: String,
}

fn default_true() -> bool {
    true
}

fn default_preview_fps() -> u32 {
    30
}

fn default_max_console_lines() -> u32 {
    500
}

fn default_panasonic_poll_interval_ms() -> u32 {
    3000
}

fn default_auto() -> String {
    "auto".to_string()
}

fn default_whisper_max_threads() -> u32 {
    4
}

fn default_dark() -> String {
    "dark".to_string()
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            raw_dir: String::new(),
            restored_dir: String::new(),
            cache_dir: String::new(),
            live_preview_enabled: true,
            preview_fps: 30,
            verbose_console: false,
            auto_scroll_console: true,
            max_console_lines: 500,
            panasonic_hotplug_enabled: true,
            panasonic_poll_interval_ms: 3000,
            preferred_ai_device: "auto".to_string(),
            whisper_max_threads: 4,
            hardware_encoder_preference: "auto".to_string(),
            high_contrast: false,
            large_text: false,
            theme: "dark".to_string(),
        }
    }
}

/// Pure boundary validator and range clamper for user preferences.
#[must_use]
pub fn validate_and_clamp_preferences(mut prefs: AppPreferences) -> AppPreferences {
    prefs.preview_fps = prefs.preview_fps.clamp(1, 60);
    prefs.max_console_lines = prefs.max_console_lines.clamp(10, 5000);
    prefs.panasonic_poll_interval_ms = prefs.panasonic_poll_interval_ms.clamp(500, 60000);
    prefs.whisper_max_threads = prefs.whisper_max_threads.clamp(1, 32);

    let clean_theme = prefs.theme.trim().to_ascii_lowercase();
    prefs.theme = if clean_theme == "light" {
        "light".to_string()
    } else {
        "dark".to_string()
    };

    prefs
}

/// Pure JSON parser for user preferences, falling back to canonical defaults on error.
#[must_use]
pub fn parse_preferences_json(json_content: &str) -> AppPreferences {
    let parsed: AppPreferences = serde_json::from_str(json_content).unwrap_or_default();
    validate_and_clamp_preferences(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_preferences_values() {
        let def = AppPreferences::default();
        assert!(def.live_preview_enabled);
        assert_eq!(def.preview_fps, 30);
        assert_eq!(def.max_console_lines, 500);
        assert_eq!(def.theme, "dark");
    }

    #[test]
    fn test_parse_preferences_with_camel_case_mirrors() {
        let json = r#"{
            "rawDir": "C:/dumps",
            "previewFps": 60,
            "theme": "light",
            "livePreviewEnabled": false
        }"#;

        let prefs = parse_preferences_json(json);
        assert_eq!(prefs.raw_dir, "C:/dumps");
        assert_eq!(prefs.preview_fps, 60);
        assert_eq!(prefs.theme, "light");
        assert!(!prefs.live_preview_enabled);
    }

    #[test]
    fn test_validate_and_clamp_bounds() {
        let out_of_bounds = AppPreferences {
            preview_fps: 240,
            max_console_lines: 5,
            panasonic_poll_interval_ms: 100,
            whisper_max_threads: 128,
            theme: "solarized".to_string(),
            ..AppPreferences::default()
        };

        let clamped = validate_and_clamp_preferences(out_of_bounds);
        assert_eq!(clamped.preview_fps, 60);
        assert_eq!(clamped.max_console_lines, 10);
        assert_eq!(clamped.panasonic_poll_interval_ms, 500);
        assert_eq!(clamped.whisper_max_threads, 32);
        assert_eq!(clamped.theme, "dark");
    }
}
