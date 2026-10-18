"""Rigid, comprehensive unit tests for specialized pipeline execution steps (pipeline_steps.py).

Verifies execution, error boundaries, toolchain resolution, checkpoint skips, and failure resilience.
"""

import json
import os
import shutil
import subprocess
import tempfile
from unittest.mock import MagicMock, patch, call
import pytest

from vhs_studio.pipeline_steps import (
    BaseRestorationStep,
    WhisperStep,
    FaceRestorationStep,
    RifeInterpolationStep,
    AIUpscalerStep,
    SceneSegmentationStep,
    CloudOffloadStep,
)


class TestBaseRestorationStep:
    """Rigid tests for BaseRestorationStep."""

    @pytest.mark.parametrize("resume_enabled", [False, True])
    def test_execute_restoration_subprocess_command(self, resume_enabled, tmp_path):
        raw_target = str(tmp_path / "stream_in.mkv")
        dest_target = str(tmp_path / "stream_out.mp4")
        config_params = {"resume": resume_enabled, "denoise": True, "output_codec": "h264"}

        with patch("subprocess.run") as mock_runner:
            resolved = BaseRestorationStep.execute(raw_target, dest_target, config_params, python_exe="py")
            assert resolved == dest_target
            mock_runner.assert_called_once()
            called_args = mock_runner.call_args[0][0]
            assert "py" in called_args
            assert raw_target in called_args
            assert dest_target in called_args
            if resume_enabled:
                assert "--resume" in called_args
            else:
                assert "--resume" not in called_args

    def test_execute_skips_when_completed_checkpoint_exists(self, tmp_path):
        raw_file = str(tmp_path / "raw.mkv")
        out_file = tmp_path / "out.mp4"
        out_file.write_bytes(b"\x00" * 2048)  # > 1024 bytes
        chk_file = tmp_path / "out.mp4.checkpoint.json"
        chk_file.write_text(json.dumps({"status": "completed"}))

        params = {"resume": True}
        with patch("subprocess.run") as mock_run:
            result = BaseRestorationStep.execute(raw_file, str(out_file), params, python_exe="python")
            assert result == str(out_file)
            mock_run.assert_not_called()

    def test_execute_does_not_skip_if_checkpoint_is_in_progress(self, tmp_path):
        raw_file = str(tmp_path / "raw.mkv")
        out_file = tmp_path / "out.mp4"
        out_file.write_bytes(b"\x00" * 2048)
        chk_file = tmp_path / "out.mp4.checkpoint.json"
        chk_file.write_text(json.dumps({"status": "in_progress"}))

        params = {"resume": True}
        with patch("subprocess.run") as mock_run:
            result = BaseRestorationStep.execute(raw_file, str(out_file), params, python_exe="python")
            assert result == str(out_file)
            mock_run.assert_called_once()
            assert "--resume" in mock_run.call_args[0][0]


class TestWhisperStep:
    """Rigid tests for WhisperStep."""

    def test_skips_when_vtt_already_exists(self, tmp_path):
        out_file = str(tmp_path / "movie.mp4")
        vtt_file = tmp_path / "movie.vtt"
        vtt_file.write_text("WEBVTT\n\n00:00.000 --> 00:05.000\nHello")

        result = WhisperStep.execute(str(tmp_path / "raw.mkv"), out_file)
        assert result == str(vtt_file)

    def test_successful_transcription_and_move(self, tmp_path):
        raw_file = str(tmp_path / "raw.mkv")
        out_file = str(tmp_path / "subdir" / "movie.mp4")
        os.makedirs(tmp_path / "subdir", exist_ok=True)

        temp_vtt = tmp_path / "temp_output.vtt"
        temp_vtt.write_text("WEBVTT\n\nGenerated subtitles")

        mock_transcribe = MagicMock(return_value=str(temp_vtt))
        with patch.dict("sys.modules", {"vhs_studio.ai.whisper_engine": MagicMock(transcribe_and_generate_vtt=mock_transcribe)}):
            result = WhisperStep.execute(raw_file, out_file)
            expected_vtt = os.path.join(str(tmp_path / "subdir"), "temp_output.vtt")
            assert result == expected_vtt
            assert os.path.exists(expected_vtt)

    def test_handles_import_error_gracefully(self, tmp_path):
        raw_file = str(tmp_path / "raw.mkv")
        out_file = str(tmp_path / "movie.mp4")

        with patch("builtins.__import__", side_effect=ImportError("faster-whisper not installed")):
            result = WhisperStep.execute(raw_file, out_file)
            assert result is None

    def test_handles_runtime_exception_gracefully(self, tmp_path):
        raw_file = str(tmp_path / "raw.mkv")
        out_file = str(tmp_path / "movie.mp4")

        mock_transcribe = MagicMock(side_effect=RuntimeError("Whisper CUDA OOM"))
        with patch.dict("sys.modules", {"vhs_studio.ai.whisper_engine": MagicMock(transcribe_and_generate_vtt=mock_transcribe)}):
            result = WhisperStep.execute(raw_file, out_file)
            assert result is None


class TestFaceRestorationStep:
    """Rigid tests for FaceRestorationStep."""

    def test_skips_when_checkpoint_exists(self, tmp_path):
        out_file = tmp_path / "tape.mp4"
        out_file.write_bytes(b"\x00" * 1024)
        faced_file = tmp_path / "tape_codeformer.mp4"
        faced_file.write_bytes(b"\x00" * 2048)

        result = FaceRestorationStep.execute(str(out_file), {"ai_face_fidelity": 0.7})
        assert result == str(faced_file)

    def test_processes_video_successfully(self, tmp_path):
        out_file = tmp_path / "tape.mp4"
        out_file.write_bytes(b"\x00" * 1024)

        mock_restorer = MagicMock()
        mock_restorer.process_video.return_value = True
        mock_class = MagicMock(return_value=mock_restorer)

        with patch.dict("sys.modules", {"vhs_studio.ai.face_restorer": MagicMock(FaceRestorer=mock_class)}):
            result = FaceRestorationStep.execute(str(out_file), {"ai_face_fidelity": 0.8})
            mock_class.assert_called_once_with(fidelity_weight=0.8)
            expected_faced = str(tmp_path / "tape_codeformer.mp4")
            assert result == expected_faced
            mock_restorer.process_video.assert_called_once_with(str(out_file), expected_faced)

    def test_returns_none_when_input_missing(self, tmp_path):
        missing_file = str(tmp_path / "missing.mp4")
        mock_class = MagicMock()
        with patch.dict("sys.modules", {"vhs_studio.ai.face_restorer": MagicMock(FaceRestorer=mock_class)}):
            result = FaceRestorationStep.execute(missing_file, {})
            assert result is None


class TestRifeInterpolationStep:
    """Rigid tests for RifeInterpolationStep."""

    def test_skips_when_checkpoint_exists(self, tmp_path):
        out_file = tmp_path / "tape.mp4"
        out_file.write_bytes(b"\x00" * 1024)
        rife_file = tmp_path / "tape_60fps.mp4"
        rife_file.write_bytes(b"\x00" * 2048)

        mock_interpolator = MagicMock()
        mock_interpolator.is_available.return_value = True
        mock_class = MagicMock(return_value=mock_interpolator)

        with patch.dict("sys.modules", {"vhs_studio.video.rife_interpolator": MagicMock(RifeInterpolator=mock_class)}):
            result = RifeInterpolationStep.execute(str(out_file))
            assert result == str(rife_file)
            mock_interpolator.interpolate_video.assert_not_called()

    def test_returns_none_when_not_available(self, tmp_path):
        out_file = tmp_path / "tape.mp4"
        out_file.write_bytes(b"\x00" * 1024)

        mock_interpolator = MagicMock()
        mock_interpolator.is_available.return_value = False
        mock_class = MagicMock(return_value=mock_interpolator)

        with patch.dict("sys.modules", {"vhs_studio.video.rife_interpolator": MagicMock(RifeInterpolator=mock_class)}):
            result = RifeInterpolationStep.execute(str(out_file))
            assert result is None

    def test_interpolates_video_successfully(self, tmp_path):
        out_file = tmp_path / "tape.mp4"
        out_file.write_bytes(b"\x00" * 1024)

        mock_interpolator = MagicMock()
        mock_interpolator.is_available.return_value = True
        mock_interpolator.interpolate_video.return_value = True
        mock_class = MagicMock(return_value=mock_interpolator)

        with patch.dict("sys.modules", {"vhs_studio.video.rife_interpolator": MagicMock(RifeInterpolator=mock_class)}):
            result = RifeInterpolationStep.execute(str(out_file))
            expected = str(tmp_path / "tape_60fps.mp4")
            assert result == expected
            mock_interpolator.interpolate_video.assert_called_once_with(str(out_file), expected)


class TestAIUpscalerStep:
    """Rigid tests for AIUpscalerStep."""

    def test_skips_when_checkpoint_exists(self, tmp_path):
        out_file = tmp_path / "tape.mp4"
        out_file.write_bytes(b"\x00" * 1024)
        upscaled_file = tmp_path / "tape_ai_upscale.mp4"
        upscaled_file.write_bytes(b"\x00" * 2048)

        mock_upscaler = MagicMock()
        mock_upscaler.ncnn_path = "/path/to/ncnn.exe"
        mock_class = MagicMock(return_value=mock_upscaler)

        with patch.dict("sys.modules", {"vhs_studio.video.ai_upscaler": MagicMock(AIUpscaler=mock_class)}):
            result = AIUpscalerStep.execute(str(out_file), {})
            assert result == str(upscaled_file)
            mock_upscaler.process_video.assert_not_called()

    def test_returns_original_path_when_ncnn_path_missing(self, tmp_path):
        out_file = tmp_path / "tape.mp4"
        out_file.write_bytes(b"\x00" * 1024)

        mock_upscaler = MagicMock()
        mock_upscaler.ncnn_path = None
        mock_class = MagicMock(return_value=mock_upscaler)

        with patch.dict("sys.modules", {"vhs_studio.video.ai_upscaler": MagicMock(AIUpscaler=mock_class)}):
            result = AIUpscalerStep.execute(str(out_file), {})
            assert result == str(out_file)

    def test_processes_upscale_successfully(self, tmp_path):
        out_file = tmp_path / "tape.mp4"
        out_file.write_bytes(b"\x00" * 1024)

        mock_upscaler = MagicMock()
        mock_upscaler.ncnn_path = "/path/to/ncnn.exe"
        mock_upscaler.process_video.return_value = True
        mock_class = MagicMock(return_value=mock_upscaler)

        with patch.dict("sys.modules", {"vhs_studio.video.ai_upscaler": MagicMock(AIUpscaler=mock_class)}):
            result = AIUpscalerStep.execute(str(out_file), {"ai_upscaler_model": "realesrgan-x4plus"})
            expected = str(tmp_path / "tape_ai_upscale.mp4")
            assert result == expected
            mock_upscaler.process_video.assert_called_once_with(str(out_file), expected)


class TestSceneSegmentationStep:
    """Rigid tests for SceneSegmentationStep."""

    def test_returns_early_when_master_file_none_or_missing(self, tmp_path):
        SceneSegmentationStep.execute(None)
        SceneSegmentationStep.execute(str(tmp_path / "nonexistent.mp4"))

    def test_returns_early_when_scenedetect_package_not_installed(self, tmp_path):
        master = tmp_path / "master.mp4"
        master.write_bytes(b"\x00" * 512)

        with patch("builtins.__import__", side_effect=ImportError("scenedetect not found")):
            SceneSegmentationStep.execute(str(master))

    def test_returns_early_when_single_scene_detected(self, tmp_path):
        master = tmp_path / "master.mp4"
        master.write_bytes(b"\x00" * 512)

        mock_scene = (MagicMock(), MagicMock())
        mock_detect = MagicMock(return_value=[mock_scene])

        with patch.dict("sys.modules", {"scenedetect": MagicMock(detect=mock_detect, ContentDetector=MagicMock())}):
            with patch("subprocess.run") as mock_run:
                SceneSegmentationStep.execute(str(master))
                mock_run.assert_not_called()

    def test_splits_scenes_when_multiple_cuts_detected(self, tmp_path):
        master = tmp_path / "master.mp4"
        master.write_bytes(b"\x00" * 512)

        mock_s1_start = MagicMock(get_timecode=MagicMock(return_value="00:00:00.000"))
        mock_s1_end = MagicMock(get_timecode=MagicMock(return_value="00:01:00.000"))
        mock_s2_start = MagicMock(get_timecode=MagicMock(return_value="00:01:00.000"))
        mock_s2_end = MagicMock(get_timecode=MagicMock(return_value="00:02:30.000"))

        scenes = [
            (mock_s1_start, mock_s1_end),
            (mock_s2_start, mock_s2_end),
        ]
        mock_detect = MagicMock(return_value=scenes)

        with patch.dict("sys.modules", {"scenedetect": MagicMock(detect=mock_detect, ContentDetector=MagicMock())}):
            with patch("subprocess.run") as mock_run:
                SceneSegmentationStep.execute(str(master))
                assert mock_run.call_count == 2
                first_cmd = mock_run.call_args_list[0][0][0]
                assert "-ss" in first_cmd
                assert "00:00:00.000" in first_cmd
                assert "-to" in first_cmd
                assert "00:01:00.000" in first_cmd
                assert "Scene_001.mp4" in first_cmd[-1]


class TestCloudOffloadStep:
    """Rigid tests for CloudOffloadStep."""

    def test_returns_early_when_auto_upload_false(self):
        with patch("vhs_studio.storage.manager.StorageManager.get_provider") as mock_get:
            CloudOffloadStep.execute("path.mp4", {"auto_upload": False})
            mock_get.assert_not_called()

    def test_uploads_to_configured_provider_successfully(self, tmp_path):
        out_file = str(tmp_path / "tape_restored.mp4")
        mock_provider = MagicMock()
        mock_cfg = {"provider": "s3"}

        with patch("vhs_studio.config.storage_config.load_storage_config", return_value=mock_cfg):
            with patch("vhs_studio.storage.manager.StorageManager.get_provider", return_value=mock_provider):
                CloudOffloadStep.execute(out_file, {"auto_upload": True, "storage_provider": "s3"})
                mock_provider.upload_video.assert_called_once_with(out_file, "tape_restored.mp4")

    def test_handles_upload_exception_gracefully(self, tmp_path):
        out_file = str(tmp_path / "tape_restored.mp4")
        mock_provider = MagicMock()
        mock_provider.upload_video.side_effect = RuntimeError("S3 Connection Timeout")
        mock_cfg = {"provider": "s3"}

        with patch("vhs_studio.config.storage_config.load_storage_config", return_value=mock_cfg):
            with patch("vhs_studio.storage.manager.StorageManager.get_provider", return_value=mock_provider):
                # Must not raise
                CloudOffloadStep.execute(out_file, {"auto_upload": True})
