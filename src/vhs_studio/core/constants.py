"""
Application-wide constants and configuration defaults.
Provides a Single Source of Truth (SSOT) to eliminate magic numbers and strings.
"""

from typing import Final, Set

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

# Framerate and audio constants
DEFAULT_NTSC_FPS: Final[float] = 29.97
DEFAULT_PAL_FPS: Final[float] = 25.0
DEFAULT_AUDIO_SAMPLE_RATE: Final[int] = 48000
DEFAULT_AUDIO_CHANNELS: Final[int] = 2

# Encoding and restoration defaults
DEFAULT_CRF: Final[int] = 18
DEFAULT_SCENE_THRESHOLD: Final[float] = 27.0
DEFAULT_ENCODER_TEST_TIMEOUT_SEC: Final[int] = 3

# Valid raw media file extensions
VALID_MEDIA_EXTENSIONS: Final[Set[str]] = {
    ".mkv",
    ".mp4",
    ".mov",
    ".avi",
    ".ts",
    ".m2ts",
}
