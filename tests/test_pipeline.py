import os
import pytest
from unittest.mock import patch
from vhs_studio.api.orchestrator_mock import PipelineOrchestrator


@patch("vhs_studio.api.orchestrator_mock.transcribe_and_generate_vtt")
@patch("scenedetect.detect")
def test_orchestrator_run_dag(mock_detect, mock_whisper, tmp_path):
    # Setup mocks
    mock_whisper.return_value = str(tmp_path / "test.vtt")
    mock_detect.return_value = []

    # Create dummy raw file
    raw_file = tmp_path / "raw.mkv"
    raw_file.write_text("dummy")

    orc = PipelineOrchestrator(max_workers=3)
    orc.run_dag(str(raw_file), {})

    mock_whisper.assert_called_once_with(str(raw_file))
    mock_detect.assert_called_once()
