"""Tests for job recovery, incomplete checkpoint scanning, process suspension, and partial video finalization."""

import json
import os
import tempfile
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from vhs_studio.api.server import app
from vhs_studio.api.process_manager import ProcessManager
from vhs_studio.video.job_recovery import (
    scan_incomplete_jobs,
    finalize_partial_video,
    discard_incomplete_job,
)


def test_process_manager_pause_resume_terminate():
    """Verify ProcessManager pause, resume, and terminate handle process states cleanly."""
    pm = ProcessManager()

    # 1. When no process is active
    pm.active_process = None
    pm.is_paused = False
    ok, msg = pm.pause()
    assert not ok
    assert "No active process" in msg

    ok, msg = pm.resume()
    assert not ok
    assert "No active process" in msg

    # 2. Mock an active process
    mock_proc = MagicMock()
    mock_proc.poll.return_value = None
    mock_proc.pid = 12345
    pm.active_process = mock_proc

    mock_psutil = MagicMock()
    mock_p_instance = MagicMock()
    mock_p_instance.children.return_value = []
    mock_psutil.Process.return_value = mock_p_instance
    mock_psutil.wait_procs.return_value = ([], [])
    mock_psutil.NoSuchProcess = Exception
    mock_psutil.AccessDenied = Exception

    with patch.dict("sys.modules", {"psutil": mock_psutil}):
        # Test pause
        ok, msg = pm.pause()
        assert ok
        assert pm.is_paused is True
        mock_p_instance.suspend.assert_called_once()

        # Cannot pause again while paused
        ok, msg = pm.pause()
        assert not ok
        assert "already paused" in msg

        # Test resume
        ok, msg = pm.resume()
        assert ok
        assert pm.is_paused is False
        mock_p_instance.resume.assert_called_once()

        # Test terminate
        res = pm.terminate()
        assert res is True
        assert pm.active_process is None
        assert pm.is_paused is False


def test_scan_incomplete_jobs():
    """Verify scan_incomplete_jobs locates in_progress checkpoints and ignores completed ones."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        # Patch RESTORED_MEDIA_DIR to test temporary directory
        with patch("vhs_studio.video.job_recovery.RESTORED_MEDIA_DIR", tmp_dir):
            # 1. Create a completed checkpoint
            comp_chk = os.path.join(tmp_dir, "done_video.mp4.checkpoint.json")
            with open(comp_chk, "w", encoding="utf-8") as f:
                json.dump({"source": "s.mkv", "destination": "done_video.mp4", "status": "completed"}, f)

            # 2. Create an in-progress checkpoint
            incomp_chk = os.path.join(tmp_dir, "tape_half.mp4.checkpoint.json")
            out_file = os.path.join(tmp_dir, "tape_half.mp4")
            with open(out_file, "wb") as f:
                f.write(b"\x00" * 4096)
            with open(incomp_chk, "w", encoding="utf-8") as f:
                json.dump({
                    "source": "dummy_source.mkv",
                    "destination": out_file,
                    "status": "in_progress",
                    "total_expected_frames": 10000,
                    "total_frames": 4000,
                    "kept_frames": 4000,
                    "frozen_frames": 0,
                    "elapsed_seconds": 120.0,
                    "fps": 29.97,
                }, f)

            jobs = scan_incomplete_jobs()
            assert len(jobs) == 1
            job = jobs[0]
            assert job["job_id"] == "tape_half"
            assert job["status"] == "in_progress"
            assert job["processed_frames"] == 4000
            assert job["progress_percent"] == 40.0
            assert job["output_size_bytes"] == 4096


def test_discard_incomplete_job():
    """Verify discard_incomplete_job cleans up all partial files and checkpoints."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        out_file = os.path.join(tmp_dir, "temp_render.mp4")
        chk_file = f"{out_file}.checkpoint.json"
        tmp_file = f"{out_file}.tmp"

        for fpath in [out_file, chk_file, tmp_file]:
            with open(fpath, "w", encoding="utf-8") as f:
                f.write("data")

        assert discard_incomplete_job(out_file) is True
        assert not os.path.exists(out_file)
        assert not os.path.exists(chk_file)
        assert not os.path.exists(tmp_file)


def test_api_incomplete_endpoints():
    """Verify API endpoints for incomplete jobs and action dispatching."""
    client = TestClient(app)

    # 1. Status endpoint
    res_status = client.get("/api/restoration/status")
    assert res_status.status_code == 200
    assert "active" in res_status.json()
    assert "is_paused" in res_status.json()

    # 2. Incomplete jobs endpoint
    res_incomp = client.get("/api/restoration/incomplete")
    assert res_incomp.status_code == 200
    data = res_incomp.json()
    assert "incomplete_jobs" in data

    # 3. Action dispatch: pause, resume, abort
    res_pause = client.post("/api/action", json={"action": "pause_process"})
    assert res_pause.status_code == 200

    res_resume = client.post("/api/action", json={"action": "resume_process"})
    assert res_resume.status_code == 200

    res_abort = client.post("/api/action", json={"action": "abort_process"})
    assert res_abort.status_code == 200
