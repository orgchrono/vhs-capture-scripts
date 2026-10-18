"""Immutable configuration and result data structures for video restoration."""

from dataclasses import dataclass
from typing import Optional
from vhs_studio.core.constants import DEFAULT_CRF


@dataclass(frozen=True)
class RestoreOptions:
    """Immutable parameter specification for primary analog video restoration."""

    input_path: str
    output_path: str
    start_sec: float = 0.0
    target_1080p: bool = True
    crf: int = DEFAULT_CRF
    mode: str = "freeze"
    audio_offset: float = 0.0
    duration: Optional[float] = None
    apply_denoise: bool = False
    apply_chroma: bool = False
    apply_comb_filter: bool = False
    apply_overscan_blanking: bool = False
    apply_audio_treatment: bool = False
    output_codec: str = "h264"
    deinterlacer: str = "auto"
    audio_mode: str = "auto"
    target_fps: Optional[float] = None


@dataclass
class RestoreResult:
    """Structured execution outcome of a video restoration session."""

    success: bool
    final_path: Optional[str] = None
    frames_processed: int = 0
    dropped_frames: int = 0
    elapsed_time: float = 0.0
    error_message: Optional[str] = None
