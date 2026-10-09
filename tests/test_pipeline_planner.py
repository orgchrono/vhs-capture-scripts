"""Unit tests for pipeline_planner functional core."""

import os
from vhs_studio.pipeline_planner import (
    resolve_output_spec,
    build_restore_command_args,
    build_scene_split_command,
    resolve_upscaler_model,
)
from vhs_studio.core.constants import DEFAULT_UPSCALER_MODEL, DEFAULT_CUGAN_MODEL


def test_resolve_output_spec_h264_1080p():
    output_path, base_name = resolve_output_spec(
        "C:/media/tape_01.mkv",
        "C:/media/out",
        {"output_codec": "h264", "no_1080p": False},
    )
    assert base_name == "tape_01"
    assert output_path == os.path.normpath("C:/media/out/tape_01_restored_1080p.mp4")


def test_resolve_output_spec_ffv1_480p():
    output_path, base_name = resolve_output_spec(
        "/media/tape_02.mov",
        "/media/out",
        {"output_codec": "ffv1", "no_1080p": True},
    )
    assert base_name == "tape_02"
    assert output_path == os.path.normpath("/media/out/tape_02_restored_480p.mkv")


def test_resolve_output_spec_prores():
    output_path, base_name = resolve_output_spec(
        "/media/tape_03.avi",
        "/media/out",
        {"output_codec": "prores"},
    )
    assert base_name == "tape_03"
    assert output_path.endswith("_restored_1080p.mov")


def test_build_restore_command_args():
    params = {
        "denoise": True,
        "chroma_fix": True,
        "dropout_clean": True,
        "ai_audio_denoise": True,
        "deinterlacer": "qtgmc",
        "crf": 16,
    }
    cmd = build_restore_command_args("in.mkv", "out.mp4", params, python_exe="python3")
    assert cmd[0] == "python3"
    assert "restore" in cmd
    assert "in.mkv" in cmd
    assert "--output" in cmd
    assert "out.mp4" in cmd
    assert "--denoise" in cmd
    assert "--chroma-fix" in cmd
    assert "--dropout-clean" in cmd
    assert "--ai-audio-denoise" in cmd
    assert "--deinterlacer" in cmd
    assert "qtgmc" in cmd
    assert "--crf" in cmd
    assert "16" in cmd


def test_build_scene_split_command():
    cmd = build_scene_split_command("master.mkv", "00:01:00.000", "00:02:00.000", "clip.mkv", "ffmpeg")
    assert cmd == [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        "master.mkv",
        "-ss",
        "00:01:00.000",
        "-to",
        "00:02:00.000",
        "-c",
        "copy",
        "clip.mkv",
    ]


def test_resolve_upscaler_model():
    assert resolve_upscaler_model({"ai_upscaler_model": "custom-model"}) == "custom-model"
    assert resolve_upscaler_model({"realcugan": True}) == DEFAULT_CUGAN_MODEL
    assert resolve_upscaler_model({}) == DEFAULT_UPSCALER_MODEL
