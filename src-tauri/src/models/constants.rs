//! Canonical Single Source of Truth (SSOT) application constants and relative paths.
//!
//! Replaces legacy Python `src/vhs_studio/core/constants.py` and `paths.py`
//! with compile-time immutable Rust constants. Zero hardcoded magic numbers or paths.

/// Default loopback host for the local IPC/HTTP bridge.
pub const DEFAULT_API_HOST: &str = "127.0.0.1";

/// Default TCP port for the local IPC/HTTP bridge.
pub const DEFAULT_API_PORT: u16 = 8088;

/// Default OBS Studio WebSocket v5 port.
pub const DEFAULT_OBS_WS_PORT: u16 = 4455;

/// Default streaming chunk size (8 MiB) for multipart cloud uploads.
pub const DEFAULT_UPLOAD_CHUNK_BYTES: u64 = 8 * 1024 * 1024;

/// Default I/O buffer size (64 KiB) for cryptographic hashing and file copies.
pub const DEFAULT_IO_BUFFER_BYTES: usize = 64 * 1024;

/// Minimum required free disk space in gigabytes for safe VHS capture/restoration.
pub const DEFAULT_MIN_FREE_DISK_GB: f64 = 20.0;

/// Relative path to the compiled React frontend bundle from project root.
pub const UI_DIST_REL_PATH: &str = "ui/dist";

/// Relative path to the UI locales directory from project root.
pub const UI_LOCALES_REL_PATH: &str = "ui/src/locales";

/// Relative path to the advanced TOML configuration file from project root.
pub const ADVANCED_CONFIG_REL_PATH: &str = "vhs_advanced_config.toml";

/// Relative path to raw captured media directory.
pub const MEDIA_RAW_REL_PATH: &str = "media/raw";

/// Relative path to restored master media directory.
pub const MEDIA_RESTORED_REL_PATH: &str = "media/restored";

/// Canonical list of all 10 mandatory supported i18n locale codes.
pub const SUPPORTED_LOCALES: [&str; 10] = [
    "pt-BR", "en-US", "es", "fr", "de", "it", "ja", "ar", "ru", "zh-CN",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ssot_constants_integrity() {
        assert_eq!(DEFAULT_API_HOST, "127.0.0.1");
        assert_eq!(DEFAULT_API_PORT, 8088);
        assert_eq!(SUPPORTED_LOCALES.len(), 10);
        assert!(SUPPORTED_LOCALES.contains(&"pt-BR"));
        assert!(SUPPORTED_LOCALES.contains(&"en-US"));
    }
}
