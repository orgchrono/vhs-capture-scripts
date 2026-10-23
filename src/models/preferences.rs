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

/// Pure `snake_case` → `camelCase` key conversion (`raw_dir` → `rawDir`).
#[must_use]
pub fn snake_to_camel(key: &str) -> String {
    let mut out = String::with_capacity(key.len());
    let mut upper_next = false;
    for c in key.chars() {
        if c == '_' {
            upper_next = true;
        } else if upper_next {
            out.extend(c.to_uppercase());
            upper_next = false;
        } else {
            out.push(c);
        }
    }
    out
}

/// Pure `camelCase` → `snake_case` key conversion (`rawDir` → `raw_dir`).
#[must_use]
pub fn camel_to_snake(key: &str) -> String {
    let mut out = String::with_capacity(key.len() + 4);
    for c in key.chars() {
        if c.is_ascii_uppercase() {
            out.push('_');
            out.push(c.to_ascii_lowercase());
        } else {
            out.push(c);
        }
    }
    out
}

/// UI wire format: canonical `snake_case` keys plus a `camelCase` mirror of each key
/// (legacy backend contract consumed by `ui/src/store/preferencesSlice.ts`).
#[must_use]
pub fn to_ui_json(prefs: &AppPreferences) -> serde_json::Value {
    let mut map = match serde_json::to_value(prefs) {
        Ok(serde_json::Value::Object(map)) => map,
        _ => serde_json::Map::new(),
    };
    let mirrors: Vec<(String, serde_json::Value)> = map
        .iter()
        .map(|(k, v)| (snake_to_camel(k), v.clone()))
        .filter(|(camel, _)| !map.contains_key(camel))
        .collect();
    map.extend(mirrors);
    serde_json::Value::Object(map)
}

/// Overlays a (possibly partial, snake- or camel-cased) update onto the current preferences.
#[must_use]
pub fn merge_preferences(current: &AppPreferences, incoming: &serde_json::Value) -> AppPreferences {
    let mut base = match serde_json::to_value(current) {
        Ok(serde_json::Value::Object(map)) => map,
        _ => serde_json::Map::new(),
    };
    if let serde_json::Value::Object(updates) = incoming {
        for (key, value) in updates {
            base.insert(camel_to_snake(key), value.clone());
        }
    }
    let merged: AppPreferences =
        serde_json::from_value(serde_json::Value::Object(base)).unwrap_or_else(|_| current.clone());
    validate_and_clamp_preferences(merged)
}

#[cfg(test)]
mod ui_contract_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_key_case_conversion_round_trip() {
        assert_eq!(snake_to_camel("panasonic_poll_interval_ms"), "panasonicPollIntervalMs");
        assert_eq!(camel_to_snake("panasonicPollIntervalMs"), "panasonic_poll_interval_ms");
        assert_eq!(snake_to_camel("theme"), "theme");
    }

    #[test]
    fn test_ui_json_contains_snake_and_camel_mirrors() {
        let ui = to_ui_json(&AppPreferences::default());
        assert!(ui.get("raw_dir").is_some());
        assert!(ui.get("rawDir").is_some());
        assert_eq!(ui.get("theme"), Some(&json!("dark")));
    }

    #[test]
    fn test_partial_camel_update_preserves_other_fields() {
        let current = merge_preferences(&AppPreferences::default(), &json!({"rawDir": "D:/cap", "previewFps": 15}));
        assert_eq!(current.raw_dir, "D:/cap");
        assert_eq!(current.preview_fps, 15);
        let next = merge_preferences(&current, &json!({"theme": "light"}));
        assert_eq!(next.raw_dir, "D:/cap");
        assert_eq!(next.theme, "light");
        let clamped = merge_preferences(&next, &json!({"previewFps": 999}));
        assert_eq!(clamped.preview_fps, 60);
    }
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
