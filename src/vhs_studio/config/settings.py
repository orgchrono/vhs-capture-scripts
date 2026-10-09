"""
config.py - Centralized configuration and constants for the VHS Restoration Pipeline.
"""

from dataclasses import dataclass
from vhs_studio.core.constants import (
    NTSC_WIDTH,
    NTSC_HEIGHT,
    DEFAULT_NTSC_FPS,
    DEFAULT_LUMA_THRESHOLD,
    DEFAULT_CONSECUTIVE_GOOD_FRAMES,
    MAX_SCAN_SECONDS,
)


@dataclass
class VideoConfig:
    """Documentation for VideoConfig."""

    DEFAULT_WIDTH: int = NTSC_WIDTH
    DEFAULT_HEIGHT: int = NTSC_HEIGHT
    DEFAULT_FPS: float = DEFAULT_NTSC_FPS
    LUMA_THRESHOLD: float = DEFAULT_LUMA_THRESHOLD
    CONSECUTIVE_GOOD_FRAMES_REQUIRED: int = DEFAULT_CONSECUTIVE_GOOD_FRAMES
    MAX_SCAN_SECONDS: int = MAX_SCAN_SECONDS


@dataclass
class Filters:
    """Documentation for Filters."""

    CHROMA_SHIFT: str = "chromashift=cbh=2:cbv=1:crh=2:crv=1:edge=smear"
    DENOISE: str = "hqdn3d=4.0:3.0:6.0:4.5"

    DEINT_BWDIF_BOB: str = "bwdif=mode=1:parity=auto"
    DEINT_BWDIF_SINGLE: str = "bwdif=mode=0:parity=auto"
    DEINT_ZNEDI3: str = "znedi3"
    DEINT_NNEDI: str = "nnedi=deint=all"
    DEINT_YADIF: str = "yadif=mode=1:parity=auto"

    UPSCALE_1080P_LANCZOS: str = (
        "scale=1440:1080:flags=lanczos:in_color_matrix=smpte170m:out_color_matrix=bt709,setsar=1:1,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,cas=0.4"  # noqa: E501
    )


@dataclass
class AudioConfig:
    """Documentation for AudioConfig."""

    PAN_MONO_LEFT: str = "pan=stereo|c0=c0|c1=c0"
    PAN_MONO_RIGHT: str = "pan=stereo|c0=c1|c1=c1"
    CODEC: str = "aac"
    BITRATE: str = "192k"


@dataclass
class OutputConfig:
    """Documentation for OutputConfig."""

    COLOR_PRIMARIES: str = "bt709"
    COLOR_TRC: str = "bt709"
    COLOR_SPACE: str = "bt709"
