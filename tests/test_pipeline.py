"""Unit and integration tests for the production PipelineOrchestrator and functional closures.

Ensures absolute integrity of pipeline execution, step runner boundaries, stage chaining closures,
degraded fallback on failure, intermediate file cleanup, and CLI dispatch.
"""

import json
import os
import sys
from unittest.mock import MagicMock, patch, call
import pytest

from vhs_studio.pipeline import (
    PipelineOrchestrator,
    make_step_runner,
    make_pipeline_chain_closure,
    main,
)


class TestMakeStepRunner:
    """Rigid tests for make_step_runner closure."""

    def test_make_step_runner_success(self):
        fn = MagicMock(return_value="/path/to/result.mp4")
        runner = make_step_runner("test_step", fn)
        res = runner()
        assert res == "/path/to/result.mp4"
        fn.assert_called_once()

    def test_make_step_runner_exception_returns_none(self):
        fn = MagicMock(side_effect=RuntimeError("Step exploded"))
        runner = make_step_runner("failing_step", fn)
        res = runner()
        assert res is None
        fn.assert_called_once()


class TestMakePipelineChainClosure:
    """Rigid tests for lexical stage chaining, intermediate tracking, and degraded fallback."""

    def test_execute_stage_disabled_records_skipped(self):
        report_session = {"record_tool_execution": MagicMock(), "sync_to_disk": MagicMock()}
        chain = make_pipeline_chain_closure("init.mp4", "master.mp4", report_session)

        step_fn = MagicMock()
        res = chain["execute_stage"]("Upscaler", "ai_upscaler", False, step_fn)

        assert res is None
        step_fn.assert_not_called()
        report_session["record_tool_execution"].assert_called_once_with("ai_upscaler", enabled=False, status="skipped")

    def test_execute_stage_applied_success_chains_video(self):
        report_session = {"record_tool_execution": MagicMock(), "sync_to_disk": MagicMock()}
        chain = make_pipeline_chain_closure("init.mp4", "master.mp4", report_session)

        step_fn = MagicMock(return_value="stage1_out.mp4")
        res = chain["execute_stage"]("FaceRestore", "ai_face_restore", True, step_fn)

        assert res == "stage1_out.mp4"
        step_fn.assert_called_once_with("init.mp4")
        report_session["record_tool_execution"].assert_called_once_with(
            "ai_face_restore",
            enabled=True,
            status="applied",
            parameters={"input_video": "init.mp4", "output_video": "stage1_out.mp4"},
        )
        report_session["sync_to_disk"].assert_called_once_with(status="in_progress")

    def test_execute_stage_failure_degrades_gracefully_with_previous(self):
        report_session = {"record_tool_execution": MagicMock(), "sync_to_disk": MagicMock()}
        chain = make_pipeline_chain_closure("init.mp4", "master.mp4", report_session)

        step_fn = MagicMock(side_effect=RuntimeError("CUDA Out of Memory"))
        res = chain["execute_stage"]("RIFE", "ai_rife", True, step_fn)

        assert res is None
        report_session["record_tool_execution"].assert_called_once()
        call_kwargs = report_session["record_tool_execution"].call_args[1]
        assert call_kwargs["enabled"] is True
        assert call_kwargs["status"] == "degraded_fallback"
        assert "CUDA Out of Memory" in call_kwargs["parameters"]["error"]

    def test_commit_master_replaces_and_cleans_intermediates(self, tmp_path):
        init_file = tmp_path / "stage1.mp4"
        init_file.write_bytes(b"\x00" * 2048)
        master_file = tmp_path / "final_master.mp4"
        report_session = {"record_tool_execution": MagicMock(), "sync_to_disk": MagicMock()}

        chain = make_pipeline_chain_closure(str(init_file), str(master_file), report_session)

        stage2_file = tmp_path / "stage2.mp4"
        stage2_file.write_bytes(b"\x00" * 4096)

        chain["execute_stage"]("Upscaler", "ai_upscaler", True, lambda v: str(stage2_file))

        final_result = chain["commit_master"]()
        assert final_result == str(master_file)
        assert os.path.exists(master_file)
        assert os.path.getsize(master_file) == 4096
        # Intermediate stage 1 should have been cleaned up
        assert not os.path.exists(init_file)


class TestPipelineOrchestrator:
    """Rigid tests for PipelineOrchestrator DAG workflow."""

    def test_is_upscaler_enabled_variants(self):
        orch = PipelineOrchestrator("raw.mkv", "out.mp4", opts={"esrgan": True})
        assert orch._is_upscaler_enabled() is True

        orch2 = PipelineOrchestrator("raw.mkv", "out.mp4", opts={}, params={"ai_upscaler": True})
        assert orch2._is_upscaler_enabled() is True

        orch3 = PipelineOrchestrator("raw.mkv", "out.mp4", opts={"esrgan": False}, params={})
        assert orch3._is_upscaler_enabled() is False

    @patch("vhs_studio.pipeline.make_archival_report_session")
    @patch.object(PipelineOrchestrator, "_task_scenedetect_and_split")
    @patch.object(PipelineOrchestrator, "_task_whisper")
    @patch.object(PipelineOrchestrator, "_task_restoration")
    @patch("vhs_studio.pipeline_steps.CloudOffloadStep.execute")
    def test_orchestrator_full_dag_execution(
        self, mock_cloud, mock_restore, mock_whisper, mock_scene, mock_report_session, tmp_path
    ):
        output_path = tmp_path / "out.mp4"
        output_path.write_bytes(b"\x00" * 2048)
        raw_file = tmp_path / "raw.mkv"
        raw_file.write_text("dummy")

        mock_restore.return_value = str(output_path)
        mock_whisper.return_value = str(tmp_path / "test.vtt")

        mock_session_inst = {
            "record_tool_execution": MagicMock(),
            "sync_to_disk": MagicMock(),
        }
        mock_report_session.return_value = mock_session_inst

        orc = PipelineOrchestrator(
            raw_file=str(raw_file),
            output_path=str(output_path),
            opts={"esrgan": False},
            params={"auto_upload": True, "ai_face_restore": False, "ai_rife_60fps": False},
        )
        res = orc.start()

        mock_restore.assert_called_once()
        mock_whisper.assert_called_once()
        mock_scene.assert_called_once_with(str(output_path))
        mock_cloud.assert_called_once()
        assert res["Restoration"] == str(output_path)
        assert res["Master"] == str(output_path)
        assert res["Whisper"] == str(tmp_path / "test.vtt")

    @patch.object(PipelineOrchestrator, "_task_restoration")
    def test_orchestrator_raises_on_primary_restoration_failure(self, mock_restore, tmp_path):
        raw_file = tmp_path / "raw.mkv"
        raw_file.write_text("dummy")
        output_path = tmp_path / "out.mp4"

        mock_restore.side_effect = RuntimeError("FFmpeg crashed")

        orc = PipelineOrchestrator(
            raw_file=str(raw_file),
            output_path=str(output_path),
            opts={},
            params={},
        )
        with pytest.raises(RuntimeError, match="FFmpeg crashed"):
            orc.start()


class TestPipelineMainCli:
    """Rigid tests for main() CLI entry point."""

    @patch("vhs_studio.core.jobs.JobManager.release_lock")
    @patch("vhs_studio.pipeline.PipelineOrchestrator.start")
    def test_main_cli_parses_json_and_executes(self, mock_start, mock_release, tmp_path):
        raw_file = str(tmp_path / "input.mkv")
        params = {"denoise": True, "output_codec": "h264"}
        params_json = json.dumps(params)

        with patch("vhs_studio.core.paths.RESTORED_MEDIA_DIR", str(tmp_path / "restored")):
            main([raw_file, "--params-json", params_json])
            mock_start.assert_called_once()
            mock_release.assert_called_once()

    @patch("vhs_studio.core.jobs.JobManager.release_lock")
    def test_main_cli_handles_permission_error_gracefully(self, mock_release, tmp_path):
        raw_file = str(tmp_path / "input.mkv")
        params_json = json.dumps({"denoise": True})

        with patch("os.makedirs", side_effect=PermissionError("Controlled Folder Access")):
            with pytest.raises(SystemExit) as exc_info:
                main([raw_file, "--params-json", params_json])
            assert exc_info.value.code == 1
