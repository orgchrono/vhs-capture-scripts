from dataclasses import dataclass
from typing import Optional

@dataclass(frozen=True)
class RestoreOptions:
    input_path: str
    output_path: str
    start_sec: float = 0.0
    target_1080p: bool = True
    crf: int = 20
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
    success: bool
    final_path: Optional[str] = None
    frames_processed: int = 0
    dropped_frames: int = 0
    elapsed_time: float = 0.0
    error_message: Optional[str] = None
