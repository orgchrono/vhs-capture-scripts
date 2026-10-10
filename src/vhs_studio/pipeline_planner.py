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

    value_options: List[str] = []

    deint = params.get("deinterlacer")
    if deint is not None:
        deint_str = str(deint)
        if deint_str.startswith("qtgmc"):
            normalized_deint = "qtgmc"
        elif deint_str in ("auto", "bwdif", "bwdif_single", "znedi3", "nnedi", "none"):
            normalized_deint = deint_str
        else:
            normalized_deint = "auto"
        value_options.extend(["--deinterlacer", normalized_deint])

    audio_mode = params.get("audio_mode")
    if audio_mode is not None:
        audio_str = str(audio_mode)
        audio_map = {
            "mono": "mono_l",
            "left_only": "mono_l",
            "right_only": "mono_r",
        }
        normalized_audio = audio_map.get(audio_str, audio_str)
        if normalized_audio in ("auto", "stereo", "mono_l", "mono_r"):
            value_options.extend(["--audio-mode", normalized_audio])
        else:
            value_options.extend(["--audio-mode", "auto"])

    mode = params.get("mode")
    if mode is not None:
        mode_str = str(mode)
        if mode_str in ("freeze", "drop", "passthrough"):
            value_options.extend(["--mode", mode_str])
        else:
            value_options.extend(["--mode", "freeze"])

    crf = params.get("crf")
    if crf is not None:
        value_options.extend(["--crf", str(crf)])

    codec = params.get("output_codec")
    if codec is not None:
        codec_str = str(codec)
        if codec_str in ("h264", "hevc", "prores", "ffv1"):
            value_options.extend(["--output-codec", codec_str])
        else:
            value_options.extend(["--output-codec", "h264"])

    resolution_flag = ["--no-1080p"] if params.get("no_1080p") else []

    return base_cmd + active_bool_flags + value_options + resolution_flag


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
