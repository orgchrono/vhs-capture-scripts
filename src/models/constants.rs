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

/// Minimum required free disk space in gigabytes for safe VHS capture/restoration
/// (parity with legacy `capture/preflight.py`, which required 50 GB).
pub const DEFAULT_MIN_FREE_DISK_GB: f64 = 50.0;

/// Length (hex characters) of the ephemeral per-session API token.
pub const SESSION_TOKEN_LENGTH: usize = 32;

/// Maximum number of subprocess log lines retained in memory (legacy `MAX_PROCESS_LOGS_HISTORY`).
pub const MAX_PROCESS_LOGS_HISTORY: usize = 500;

/// Polling interval (ms) used by the Server-Sent Events log stream.
pub const SSE_POLL_INTERVAL_MS: u64 = 200;

/// Consecutive idle SSE ticks (process finished, no new logs) before the stream is closed.
pub const SSE_IDLE_TICKS_BEFORE_CLOSE: u32 = 2;

/// Polling interval (ms) of the background batch queue worker.
pub const QUEUE_POLL_INTERVAL_MS: u64 = 1000;

/// Minimum interval (ms) between two `PROGRESS:` console lines emitted by a restoration job.
pub const PROGRESS_LOG_INTERVAL_MS: u64 = 1000;

/// File name of the persisted batch queue inside the VHS Studio data directory.
pub const QUEUE_FILE_NAME: &str = "queue.json";

/// File name of the persisted preferences inside the VHS Studio data directory.
pub const PREFERENCES_FILE_NAME: &str = "preferences.json";

/// Name of the VHS Studio data directory inside the user home.
pub const STUDIO_DATA_DIR_NAME: &str = ".vhs_studio";

/// Environment variable overriding the VHS Studio data directory.
pub const STUDIO_DIR_ENV_KEY: &str = "VHS_STUDIO_DIR";

/// Relative path to the generic media root.
pub const MEDIA_ROOT_REL_PATH: &str = "media";

/// Relative path to the thumbnail cache directory (below the data directory).
pub const THUMBNAIL_CACHE_DIR_NAME: &str = "thumbnails";

/// Maximum accepted HTTP request body size (8 MiB).
pub const MAX_HTTP_BODY_BYTES: usize = 8 * 1024 * 1024;

/// Maximum accepted HTTP request head size (64 KiB).
pub const MAX_HTTP_HEAD_BYTES: usize = 64 * 1024;

/// Socket read timeout in seconds for incoming HTTP connections.
pub const HTTP_READ_TIMEOUT_SECS: u64 = 15;

/// Seconds a preview thumbnail extraction may take before it is abandoned.
pub const DEFAULT_THUMBNAIL_SEEK_SEC: f64 = 5.0;

/// Loopback host names accepted by the origin/host verification middleware.
pub const LOOPBACK_HOSTS: [&str; 5] = ["127.0.0.1", "localhost", "[::1]", "tauri.localhost", "testserver"];

/// Extra extensions (lowercase, no dot) accepted as raw ingest sources (disk images / dumps).
pub const VALID_INGEST_EXTENSIONS: [&str; 8] = ["img", "raw", "bin", "iso", "dd", "vro", "mpg", "mpeg"];

/// Physical block-device path prefixes accepted by the ingest path guard.
pub const BLOCK_DEVICE_PREFIXES: [&str; 5] = [
    "\\\\.\\PhysicalDrive",
    "/dev/sd",
    "/dev/nvme",
    "/dev/rdisk",
    "/dev/disk",
];

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

/// Panasonic DMR-EH55 Service Bootloader / HDD replacement image size (100 MiB / 104,857,600 bytes).
pub const PANASONIC_FIRMWARE_SERVICE_IMAGE_SIZE_BYTES: u64 = 104_857_600;

/// Panasonic Firmware .FRM update optical disc image size (3 MiB / 3,145,728 bytes).
pub const PANASONIC_FIRMWARE_UPDATE_SIZE_BYTES: u64 = 3_145_728;

/// Default frame rate for real-time MJPEG browser monitoring stream proxy.
pub const DEFAULT_STREAM_PROXY_FPS: u32 = 15;

/// Preview video resolution width for MJPEG monitor streaming.
pub const STREAM_PROXY_WIDTH_PX: u32 = 640;

/// Preview video resolution height for MJPEG monitor streaming.
pub const STREAM_PROXY_HEIGHT_PX: u32 = 360;

/// Quality level (q:v) for FFmpeg MJPEG streaming encoder (lower is higher quality, 8 is optimal for preview).
pub const STREAM_PROXY_JPEG_QUALITY: u32 = 8;

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
