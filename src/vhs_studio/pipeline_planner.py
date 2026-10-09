"""Functional Core for pipeline planning and parameter compilation.

Provides pure functions without I/O or side-effects for deterministically
resolving paths, commands, and DAG task execution matrices (SoC & SRP).
"""

import os
from typing import Mapping, List, Tuple
from vhs_studio.core.constants import (
    DEFAULT_UPSCALER_MODEL,
    DEFAULT_CUGAN_MODEL,
)


def resolve_output_spec(
    input_path: str, output_dir: str, params: Mapping[str, object]
) -> Tuple[str, str]:
    """Pure function resolving final destination path and file base name."""
    base_name = os.path.splitext(os.path.basename(input_path))[0]
    suffix = "480p" if params.get("no_1080p") else "1080p"
    codec = str(params.get("output_codec", "h264"))

    ext_map = {"ffv1": "mkv", "prores": "mov"}
    ext = ext_map.get(codec, "mp4")

    filename = f"{base_name}_restored_{suffix}.{ext}"
    return os.path.normpath(os.path.join(output_dir, filename)), base_name


def build_restore_command_args(
    raw_file: str,
    output_path: str,
    params: Mapping[str, object],
    python_exe: str = "",
) -> List[str]:
    """Pure functional constructor for CLI primary restoration arguments."""
    base_cmd = [
        python_exe or "python",
        "-m",
        "vhs_studio.cli.main",
        "restore",
        raw_file,
        "--output",
        output_path,
    ]

    boolean_flag_specs = (
        ("denoise", "--denoise"),
        ("chroma_fix", "--chroma-fix"),
        ("comb_filter", "--comb-filter"),
        ("overscan_blanking", "--overscan-blanking"),
        ("audio_treatment", "--audio-treatment"),
        ("dropout_clean", "--dropout-clean"),
        ("ai_audio_denoise", "--ai-audio-denoise"),
    )

    active_bool_flags = [
        flag for key, flag in boolean_flag_specs if bool(params.get(key))
    ]

    value_option_specs = (
        ("deinterlacer", "--deinterlacer"),
        ("audio_mode", "--audio-mode"),
        ("mode", "--mode"),
        ("crf", "--crf"),
        ("output_codec", "--output-codec"),
    )

    active_value_options = [
        arg
        for key, opt in value_option_specs
        if params.get(key) is not None
        for arg in (opt, str(params[key]))
    ]

    resolution_flag = ["--no-1080p"] if params.get("no_1080p") else []

    return base_cmd + active_bool_flags + active_value_options + resolution_flag


def build_scene_split_command(
    master_file: str,
    start_time: str,
    end_time: str,
    out_clip: str,
    ffmpeg_bin: str = "ffmpeg",
) -> List[str]:
    """Pure function assembling fast stream-copy slicing command for scene clips."""
    return [
        ffmpeg_bin,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        master_file,
        "-ss",
        start_time,
        "-to",
        end_time,
        "-c",
        "copy",
        out_clip,
    ]


def resolve_upscaler_model(params: Mapping[str, object]) -> str:
    """Pure helper to select AI upscaler model string."""
    model = params.get("ai_upscaler_model")
    if model:
        return str(model)
    if params.get("realcugan"):
        return DEFAULT_CUGAN_MODEL
    return DEFAULT_UPSCALER_MODEL
