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

/// OBS auto-watcher polling interval in milliseconds (250 ms).
pub const OBS_WATCHER_POLL_INTERVAL_MS: u64 = 250;

/// Minimum signal duration in seconds to trigger auto-start recording (100 ms).
pub const OBS_WATCHER_START_CONFIRM_SEC: f64 = 0.10;

/// Blank / blue screen silence duration in seconds to trigger auto-stop recording (3.5 seconds).
pub const OBS_WATCHER_STOP_BLANK_CONFIRM_SEC: f64 = 3.50;

/// Quiet scene duration in seconds before stopping recording (scene protection, 25.0 seconds).
pub const OBS_WATCHER_STOP_QUIET_SCENE_SEC: f64 = 25.0;

/// Screenshot thumbnail width in pixels for OBS auto-watcher frame analysis.
pub const OBS_WATCHER_THUMBNAIL_WIDTH_PX: u32 = 16;

/// Screenshot thumbnail height in pixels for OBS auto-watcher frame analysis.
pub const OBS_WATCHER_THUMBNAIL_HEIGHT_PX: u32 = 12;

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
pub const DEFAULT_THUMBNAIL_SEEK_SEC: f64 = 15.0;

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

/// Default primary read chunk size (1 MiB) for sequential raw disk imaging.
pub const DISK_IMAGER_PRIMARY_CHUNK_BYTES: usize = 1024 * 1024;

/// Standard legacy ATA/SATA/SD physical sector size in bytes (512 B).
pub const DISK_SECTOR_SIZE_512: u32 = 512;

/// Optical DVD-RAM / DVD-VR / ISO9660 physical sector size in bytes (2048 B).
pub const DISK_SECTOR_SIZE_OPTICAL_2048: u32 = 2048;

/// Advanced Format 4Kn physical sector size in bytes (4096 B).
pub const DISK_SECTOR_SIZE_4K: u32 = 4096;

/// Telemetry broadcast frequency interval in milliseconds (250 ms = 4 Hz).
pub const DISK_IMAGER_TELEMETRY_INTERVAL_MS: u64 = 250;

/// Number of visual buckets in the UI Sector Health Map.
pub const DISK_IMAGER_SECTOR_MAP_BUCKETS: usize = 128;

/// Forensic ingest report sidecar suffix.
pub const DUMP_LOG_SIDECAR_SUFFIX: &str = ".dump_log.json";

/// Cryptographic SHA-256 fixity sidecar suffix.
pub const SHA256_SIDECAR_SUFFIX: &str = ".sha256";

/// Structured SSE log prefix for 4 Hz real-time disk imaging telemetry.
pub const DISK_IMAGING_SSE_PREFIX: &str = "DISK_IMAGING_PROGRESS:";

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

/// Canonical overscan blanking height in pixels (head switching noise mask at bottom).
pub const OVERSCAN_BLANKING_HEIGHT_PX: u32 = 16;

/// Maximum buffer capacity for LineAssembler before forcing a line split to prevent memory leaks on malformed binary streams.
pub const MAX_LINE_ASSEMBLER_PENDING_BYTES: usize = 16 * 1024;

/// Maximum consecutive frames to hold during severe TBC dropouts before falling back to the previous frame.
pub const MAX_TBC_HOLD_FRAMES: usize = 6;

/// High luminance threshold for detecting blown-out analog whiteout / static noise during TBC analysis.
pub const DEFAULT_TBC_WHITE_THRESHOLD: f64 = 0.9200;

/// Default VapourSynth memory cache size in megabytes for QTGMC processing.
pub const DEFAULT_VPY_CACHE_SIZE_MB: usize = 4000;

/// Default checkpoint flush interval measured in processed video frames.
pub const CHECKPOINT_FLUSH_INTERVAL_FRAMES: u64 = 500;

/// Minimum percentage of the expected output duration/frames a restoration must reach
/// before it is considered complete (below this, the run is flagged as truncated).
pub const MIN_RESTORATION_COMPLETION_PERCENT: u64 = 90;

/// Frame-rate multiplier produced by bob/double-rate deinterlacers on interlaced sources.
pub const DOUBLE_RATE_FPS_MULTIPLIER: f64 = 2.0;

/// Frame-rate multiplier of inverse telecine (24 of every 30 frames kept).
pub const IVTC_FPS_MULTIPLIER: f64 = 0.8;

/// Video CRF quality setting for OAIS DIP Web Distribution Proxy derivatives.
pub const DIP_PROXY_CRF: u8 = 20;

/// Audio bitrate for OAIS DIP Web Distribution Proxy derivatives.
pub const DIP_PROXY_AUDIO_BITRATE: &str = "192k";

/// Canonical comparison preview extraction width in pixels.
pub const COMPARISON_PREVIEW_WIDTH: u32 = 640;

/// Canonical comparison preview extraction height in pixels.
pub const COMPARISON_PREVIEW_HEIGHT: u32 = 480;

/// Comb detection plane difference threshold in QTGMC deinterlacing script.
pub const QTGMC_COMB_PLANE_STATS_THRESHOLD: f64 = 0.0705;

/// Maximum luma mean to consider an OBS captured frame as total blackout.
pub const OBS_LUMA_BLACKOUT_MAX: f64 = 18.0;

/// Minimum blue dominance threshold to detect a blue screen condition.
pub const OBS_BLUE_DOMINANCE_MIN: f64 = 110.0;

/// Number of consecutive matching frames required to trigger OBS auto-watcher state transition.
pub const OBS_TRIGGER_HYSTERESIS_FRAMES: u32 = 5;

// Canonical FFmpeg filter strings (SSOT)
pub const FILTER_EBU_R103_LEGALIZER: &str = "limiter=min=16:max=235:planes=1,limiter=min=16:max=240:planes=6";
pub const FILTER_DEDOT: &str = "dedot=m=dotcrawl+rainbows";
pub const FILTER_DROPOUT_CLEAN: &str = "removegrain=m=1,tmedian=radius=1";
pub const FILTER_CHROMA_SHIFT: &str = "chromashift=cbh=2:cbv=1:crh=2:crv=1:edge=smear";
pub const FILTER_DENOISE_HQDN3D: &str = "hqdn3d=4.0:3.0:6.0:4.5";
pub const FILTER_IVTC_PULLDOWN: &str = "fieldmatch=order=tff:combmatch=full,bwdif=mode=0:parity=-1:deint=1,decimate";
pub const FILTER_AUDIO_AZIMUTH_HIGH_SHELF: &str = "treble=g=3.5:f=6500:w=0.6,stereotools=mlev=1.0:mpan=0.0:phase=1";
pub const FILTER_AUDIO_ASYNC_RESAMPLE: &str = "aresample=async=1000:min_hard_comp=0.100000:first_pts=0";
pub const FILTER_AUDIO_EBU_R128_LOUDNORM: &str = "loudnorm=I=-23:LRA=7:tp=-1.5";
pub const FILTER_AUDIO_AFFTDN: &str = "afftdn=nr=12.0:nf=-50.0:tn=1";
pub const FILTER_UPSCALE_1080P: &str = "scale=-1:1080:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black";
pub const FILTER_TBC_FRAME_HOLD: &str = "tinterlace=mode=merge";

/// Canonical folder name for user videos across operating systems.
pub const OS_VIDEOS_FOLDER_NAME: &str = "Videos";

/// Canonical fallback folder name for user videos on macOS (Movies).
pub const OS_MOVIES_FOLDER_NAME: &str = "Movies";

/// Root directory name for VHS Studio Pro files within the user's Videos folder.
pub const STUDIO_VIDEOS_ROOT_NAME: &str = "VHS Studio Pro";

/// Subdirectory name for raw analog video captures.
pub const SUBDIR_RAW: &str = "raw";

/// Subdirectory name for restored video masters.
pub const SUBDIR_RESTORED: &str = "restored";

/// Subdirectory name for live device captures.
pub const SUBDIR_CAPTURES: &str = "captures";

/// Subdirectory name for extracted and generated subtitle files.
pub const SUBDIR_SUBTITLES: &str = "subtitles";

/// Subdirectory name for temporary restoration working files and chunks.
pub const SUBDIR_WORK: &str = "work";

/// Default directory scan depth for media discovery.
pub const DEFAULT_SCAN_MAX_DEPTH: usize = 3;

/// Hard upper limit for recursive directory scan depth to prevent stack overflow or filesystem lockup.
pub const MAX_SCAN_DEPTH_LIMIT: usize = 6;

/// Schema version for `.manifest.json` lineage sidecar files.
pub const MEDIA_MANIFEST_SCHEMA_VERSION: u32 = 1;

/// File extension suffix appended to media paths for lineage sidecar persistence.
pub const MANIFEST_SIDECAR_SUFFIX: &str = ".manifest.json";

// Canonical Multi-Pipeline Stage Identifiers (SSOT)
pub const STAGE_1_DEINTERLACE_QTGMC: &str = "stage_1_deinterlace_qtgmc";
pub const STAGE_1_DEINTERLACE_BWDIF: &str = "stage_1_deinterlace_bwdif";
pub const STAGE_1_COMB_FILTER: &str = "stage_1_comb_filter";
pub const STAGE_1_CHROMA_SHIFT: &str = "stage_1_chroma_shift";
pub const STAGE_1_OVERSCAN_BLANKING: &str = "stage_1_overscan_blanking";
pub const STAGE_1_BROADCAST_LEGALIZER: &str = "stage_1_broadcast_legalizer";
pub const STAGE_1_AUDIO_EBU_R128: &str = "stage_1_audio_ebu_r128";
pub const STAGE_1_TBC_HOLD: &str = "stage_1_tbc_hold";
pub const STAGE_2_AI_FACE_RESTORE: &str = "stage_2_ai_face_restore";
pub const STAGE_2_AI_UPSCALER: &str = "stage_2_ai_upscaler";
pub const STAGE_2_AI_RIFE_60FPS: &str = "stage_2_ai_rife_60fps";
pub const STAGE_2_WHISPER_SUBTITLES: &str = "stage_2_whisper_subtitles";
pub const STAGE_3_BLACKFRAME_TRIM: &str = "stage_3_blackframe_trim";

/// Complete ordered catalog of pipeline stages for `available_stages` computation.
pub const ALL_PIPELINE_STAGES: [&str; 13] = [
    STAGE_1_DEINTERLACE_QTGMC,
    STAGE_1_DEINTERLACE_BWDIF,
    STAGE_1_COMB_FILTER,
    STAGE_1_CHROMA_SHIFT,
    STAGE_1_OVERSCAN_BLANKING,
    STAGE_1_BROADCAST_LEGALIZER,
    STAGE_1_AUDIO_EBU_R128,
    STAGE_1_TBC_HOLD,
    STAGE_2_AI_FACE_RESTORE,
    STAGE_2_AI_UPSCALER,
    STAGE_2_AI_RIFE_60FPS,
    STAGE_2_WHISPER_SUBTITLES,
    STAGE_3_BLACKFRAME_TRIM,
];

/// Stage 2 & Stage 3 non-destructive stages allowed on progressive Master files.
pub const MASTER_ELIGIBLE_STAGES: [&str; 5] = [
    STAGE_2_AI_FACE_RESTORE,
    STAGE_2_AI_UPSCALER,
    STAGE_2_AI_RIFE_60FPS,
    STAGE_2_WHISPER_SUBTITLES,
    STAGE_3_BLACKFRAME_TRIM,
];

/// Default minimum black interval duration in seconds for FFmpeg `blackdetect` (40ms = ~1 NTSC frame).
pub const BLACK_DETECT_MIN_DURATION_SEC: f64 = 0.040;

/// Default pixel black threshold (`pix_th`) for FFmpeg `blackdetect`.
pub const BLACK_DETECT_PIX_TH: f64 = 0.12;

/// Default picture black ratio threshold (`pic_th`) for FFmpeg `blackdetect`.
pub const BLACK_DETECT_PIC_TH: f64 = 0.96;

/// Maximum gap in seconds between two black intervals to fuse them (`merge_black_intervals`).
pub const BLACK_MERGE_MAX_GAP_SEC: f64 = 0.25;

/// Maximum timestamp from 0.0s for a black interval to be classified as a tape `Leader`.
pub const BLACK_LEADER_MAX_START_SEC: f64 = 0.50;

/// Tolerance in seconds from total duration for a black interval to be classified as a `Trailer`.
pub const BLACK_TRAILER_EPSILON_SEC: f64 = 0.50;

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
