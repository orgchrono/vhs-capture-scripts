"""
Application-wide constants and configuration defaults.
Provides a Single Source of Truth (SSOT) to eliminate magic numbers and strings.
"""

from typing import Final, Set, Tuple

# File encoding default
DEFAULT_FILE_ENCODING: Final[str] = "utf-8"

# API Server defaults
DEFAULT_API_HOST: Final[str] = "127.0.0.1"
DEFAULT_API_PORT: Final[int] = 8088

# OBS Studio WebSocket defaults
OBS_WEBSOCKET_HOST: Final[str] = "127.0.0.1"
OBS_WEBSOCKET_PORT: Final[int] = 4455

# Security settings
SESSION_TOKEN_LENGTH: Final[int] = 32

# Video resolution and geometry defaults
NTSC_WIDTH: Final[int] = 720
NTSC_HEIGHT: Final[int] = 480
PAL_WIDTH: Final[int] = 720
PAL_HEIGHT: Final[int] = 576
HD_1080P_WIDTH: Final[int] = 1920
HD_1080P_HEIGHT: Final[int] = 1080
OVERSCAN_BLANKING_HEIGHT_PX: Final[int] = 12

# Framerate and audio constants
DEFAULT_NTSC_FPS: Final[float] = 29.97
DEFAULT_PAL_FPS: Final[float] = 25.0
DEFAULT_AUDIO_SAMPLE_RATE: Final[int] = 48000
DEFAULT_AUDIO_CHANNELS: Final[int] = 2
AUDIO_NOTCH_HUM_FREQ_HZ: Final[int] = 60
AUDIO_NOTCH_WIDTH_HZ: Final[int] = 5
AUDIO_NOTCH_ATTENUATION_DB: Final[int] = -30
DEFAULT_AUDIO_DENOISE_NR_DB: Final[float] = 18.0
DEFAULT_AUDIO_DENOISE_NF_DB: Final[float] = -45.0

# Encoding and restoration defaults
DEFAULT_CRF: Final[int] = 18
DEFAULT_SCENE_THRESHOLD: Final[float] = 27.0
DEFAULT_ENCODER_TEST_TIMEOUT_SEC: Final[int] = 3
DEFAULT_LUMA_THRESHOLD: Final[float] = 18.0
DEFAULT_LUMA_DETECT_MARGIN: Final[float] = 4.0
DEFAULT_CONSECUTIVE_GOOD_FRAMES: Final[int] = 5
MAX_SCAN_SECONDS: Final[int] = 120

# Dropout cleaner constants
DEFAULT_DROPOUT_LUMA_THRESHOLD: Final[int] = 235
DEFAULT_DROPOUT_LINE_RATIO: Final[float] = 0.85

# CodeFormer face restorer defaults
DEFAULT_CODEFORMER_FIDELITY: Final[float] = 0.7

# RIFE defaults
DEFAULT_RIFE_TARGET_FPS: Final[float] = 60.0
DEFAULT_RIFE_MODEL: Final[str] = "rife-v4.6"

# AI Upscaler defaults
DEFAULT_UPSCALER_MODEL: Final[str] = "realesrgan-x4plus"
DEFAULT_CUGAN_MODEL: Final[str] = "models-se"

# Hardware Tier thresholds
TIER_4_MIN_VRAM_GB: Final[float] = 6.0
TIER_2_MIN_CPU_CORES: Final[int] = 8

# Valid raw media file extensions
VALID_MEDIA_EXTENSIONS: Final[Set[str]] = {
    ".mkv",
    ".mp4",
    ".mov",
    ".avi",
    ".ts",
    ".m2ts",
}

# Subprocess & System probe constants
OBS_PROCESS_NAMES: Final[Tuple[str, ...]] = ("obs64.exe", "obs32.exe", "obs")
DEFAULT_SOCKET_TIMEOUT_SEC: Final[float] = 0.2
DEFAULT_PROCESS_CHECK_TIMEOUT_SEC: Final[float] = 1.0
DEFAULT_SSE_POLL_INTERVAL_SEC: Final[float] = 0.2
MAX_PROCESS_LOGS_HISTORY: Final[int] = 500
