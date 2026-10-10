"""Unit tests for the production PipelineOrchestrator."""

from unittest.mock import patch
from vhs_studio.pipeline import PipelineOrchestrator


@patch.object(PipelineOrchestrator, "_task_whisper")
@patch.object(PipelineOrchestrator, "_task_scenedetect_and_split")
@patch.object(PipelineOrchestrator, "_task_restoration")
def test_orchestrator_run_dag(mock_restore, mock_scene, mock_whisper, tmp_path):
    output_path = tmp_path / "out.mp4"
    mock_restore.return_value = str(output_path)
    mock_whisper.return_value = str(tmp_path / "test.vtt")
    mock_scene.return_value = []

    raw_file = tmp_path / "raw.mkv"
    raw_file.write_text("dummy")

    orc = PipelineOrchestrator(
        raw_file=str(raw_file),
        output_path=str(output_path),
        opts={"esrgan": False},
        params={"auto_upload": False},
    )
    orc.start()

    mock_restore.assert_called_once()
    mock_whisper.assert_called_once()
    mock_scene.assert_called_once()
    assert orc.results["Restoration"] == str(output_path)
