import os
import pytest
from unittest.mock import patch, MagicMock
from vhs_studio.pipeline import PipelineOrchestrator, main


def test_pipeline_orchestrator_init(tmp_path):
    raw_file = tmp_path / "raw.mkv"
    raw_file.write_text("raw")
    output_path = tmp_path / "output.mp4"

    orch = PipelineOrchestrator(
        raw_file=str(raw_file),
        output_path=str(output_path),
        opts={"esrgan": True},
        params={"auto_upload": False, "denoise": True},
    )

    assert orch.raw_file == os.path.abspath(str(raw_file))
    assert orch.output_path == os.path.abspath(str(output_path))
    assert orch.opts["esrgan"] is True
    assert orch.params["denoise"] is True


@patch("subprocess.run")
def test_pipeline_task_restoration(mock_run, tmp_path):
    raw_file = tmp_path / "raw.mkv"
    raw_file.write_text("raw")
    output_path = tmp_path / "output.mp4"

    orch = PipelineOrchestrator(
        raw_file=str(raw_file),
        output_path=str(output_path),
        opts={},
        params={
            "denoise": True,
            "chroma_fix": True,
            "deinterlacer": "bwdif",
            "audio_mode": "stereo",
            "output_codec": "h264",
        },
    )

    result = orch._task_restoration()
    assert result == str(output_path)
    mock_run.assert_called_once()
    called_cmd = mock_run.call_args[0][0]
    assert "--denoise" in called_cmd
    assert "--chroma-fix" in called_cmd
    assert "--output" in called_cmd


@patch("vhs_studio.video.ai_upscaler.AIUpscaler.process_video")
@patch("vhs_studio.video.ai_upscaler.AIUpscaler._find_or_download_ncnn")
def test_pipeline_task_esrgan(mock_ncnn, mock_process, tmp_path):
    raw_file = tmp_path / "raw.mkv"
    raw_file.write_text("raw")
    output_path = tmp_path / "output.mp4"
    output_path.write_text("dummy")

    mock_ncnn.return_value = "/mock/realesrgan.exe"

    orch = PipelineOrchestrator(
        raw_file=str(raw_file),
        output_path=str(output_path),
        opts={"esrgan": True},
    )

    result = orch._task_esrgan()
    assert result is not None
    mock_process.assert_called_once()


@patch.object(PipelineOrchestrator, "_task_restoration")
@patch.object(PipelineOrchestrator, "_task_whisper")
@patch.object(PipelineOrchestrator, "_task_scenedetect_and_split")
def test_pipeline_start_dag(mock_split, mock_whisper, mock_restore, tmp_path):
    raw_file = tmp_path / "raw.mkv"
    raw_file.write_text("raw")
    output_path = tmp_path / "output.mp4"

    mock_restore.return_value = str(output_path)
    mock_whisper.return_value = str(tmp_path / "raw.vtt")

    orch = PipelineOrchestrator(
        raw_file=str(raw_file),
        output_path=str(output_path),
        opts={"esrgan": False},
        params={"auto_upload": False},
    )

    orch.start()

    mock_restore.assert_called_once()
    mock_whisper.assert_called_once()
    mock_split.assert_called_once()
    assert orch.results["Restoration"] == str(output_path)


@patch.object(PipelineOrchestrator, "start")
def test_pipeline_cli_main(mock_start, tmp_path):
    raw_file = tmp_path / "input.mkv"
    raw_file.write_text("dummy")

    unknown_args = [
        str(raw_file),
        "--params-json",
        '{"denoise": true, "output_codec": "h264"}',
    ]

    main(unknown_args)
    mock_start.assert_called_once()
