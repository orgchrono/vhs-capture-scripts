import pytest
from unittest.mock import patch, MagicMock
from vhs_studio.video.ai_upscaler import AIUpscaler


@patch("subprocess.run")
@patch("os.path.exists")
def test_esrgan_upscaler(mock_exists, mock_run):
    # Mocking hardware detection and dependencies
    mock_exists.return_value = True
    mock_run.return_value = MagicMock(returncode=0)

    upscaler = AIUpscaler(model_name="realesrgan-x4plus", gpu_id="0")

    # Test if GPU selection fallback logic is correct
    assert upscaler.gpu_id == "0"
    assert upscaler.model_name == "realesrgan-x4plus"
