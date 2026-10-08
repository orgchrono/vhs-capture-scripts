"""
config.py - Centralized configuration and constants for the VHS Restoration Pipeline.
"""

from dataclasses import dataclass


@dataclass
class VideoConfig:
    DEFAULT_WIDTH: int = 720
    DEFAULT_HEIGHT: int = 480
    DEFAULT_FPS: float = 29.97
    LUMA_THRESHOLD: float = 18.0
    CONSECUTIVE_GOOD_FRAMES_REQUIRED: int = 5
    MAX_SCAN_SECONDS: int = 120


@dataclass
class Filters:
    CHROMA_SHIFT: str = "chromashift=cbh=2:cbv=1:crh=2:crv=1:edge=smear"
    DENOISE: str = "hqdn3d=4.0:3.0:6.0:4.5"

    DEINT_BWDIF_BOB: str = "bwdif=mode=1:parity=auto"
    DEINT_BWDIF_SINGLE: str = "bwdif=mode=0:parity=auto"
    DEINT_ZNEDI3: str = "znedi3"
    DEINT_NNEDI: str = "nnedi=deint=all"
    DEINT_YADIF: str = "yadif=mode=1:parity=auto"

    UPSCALE_1080P_LANCZOS: str = (
        "scale=1440:1080:flags=lanczos:in_color_matrix=smpte170m:out_color_matrix=bt709,setsar=1:1,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,cas=0.4"
    )


@dataclass
class AudioConfig:
    PAN_MONO_LEFT: str = "pan=stereo|c0=c0|c1=c0"
    PAN_MONO_RIGHT: str = "pan=stereo|c0=c1|c1=c1"
    CODEC: str = "aac"
    BITRATE: str = "192k"


@dataclass
class OutputConfig:
    COLOR_PRIMARIES: str = "bt709"
    COLOR_TRC: str = "bt709"
    COLOR_SPACE: str = "bt709"
