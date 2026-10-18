import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from vhs_studio.api.server import app, SESSION_TOKEN


@pytest.fixture
def client():
    return TestClient(app, base_url="http://localhost")


def test_api_get_token(client):
    response = client.get("/api/token")
    assert response.status_code == 200
    assert response.json() == {"token": SESSION_TOKEN}


@patch("vhs_studio.api.server.ensure_obs_running")
@patch("vhs_studio.core.filter_builder.FilterBuilder.detect_best_encoder")
@patch("vhs_studio.video.vapoursynth_qtgmc.VapourSynthQTGMC.is_available")
def test_api_get_status(mock_vs, mock_enc, mock_obs, client):
    mock_enc.return_value = "h264_nvenc"
    mock_vs.return_value = True
    mock_obs.return_value = True

    response = client.get("/api/status")
    assert response.status_code == 200
    data = response.json()
    assert data["encoder"] == "h264_nvenc"
    assert data["vapoursynth_available"] is True
    assert data["obs_connected"] is True
    assert "raw_files" in data
    assert "process_running" in data


def test_api_storage_config_get(client):
    response = client.get("/api/storage/config")
    assert response.status_code == 200
    data = response.json()
    assert "provider" in data
    assert "available_providers" in data


def test_api_action_invalid(client):
    response = client.post(
        "/api/action",
        json={"action": "non_existent_action"},
        headers={"X-Session-Token": SESSION_TOKEN},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert data["message"] in ("Unknown action.", "Ação desconhecida solicitada.")


def test_api_action_stop_process_none_running(client):
    response = client.post(
        "/api/action",
        json={"action": "stop_process"},
        headers={"X-Session-Token": SESSION_TOKEN},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert data["message"] in (
        "No process currently running.",
        "Nenhum processo em execução no momento.",
        "Nenhum processo em execução para interromper.",
    )


def test_api_action_start_restore_invalid_file(client):
    response = client.post(
        "/api/action",
        json={"action": "start_restore", "params": {"input": "invalid_path"}},
        headers={"X-Session-Token": SESSION_TOKEN},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert data["message"] in ("Invalid or insecure file path.", "Caminho de arquivo inválido ou não seguro.")


@patch("vhs_studio.api.server.OBSClient")
def test_api_obs_stats(mock_obs_cls, client):
    mock_obs = MagicMock()
    mock_obs.is_connected = True
    mock_obs.send_request.side_effect = lambda req: (
        {
            "outputActive": True,
            "outputTimecode": "00:05:22",
            "outputDuration": 322000,
            "outputBytes": 104857600,
        }
        if req == "GetRecordStatus"
        else {
            "outputBitrate": 15200.5,
            "activeFps": 59.94,
            "cpuUsage": 12.4,
            "memoryUsage": 350.2,
        }
    )
    mock_obs_cls.return_value = mock_obs

    response = client.get("/api/obs/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["connected"] is True
    assert data["recording"] is True
    assert data["timecode"] == "00:05:22"
    assert data["bitrate_kbps"] == 15200.5
    assert data["fps"] == 59.9


def test_api_queue_endpoints(client):
    # Test GET queue
    response = client.get("/api/queue")
    assert response.status_code == 200
    data = response.json()
    assert "jobs" in data
    assert "stats" in data
    assert "worker_running" in data

    # Test Enqueue invalid path
    bad_res = client.post(
        "/api/queue/enqueue",
        json={"input": "insecure_folder/tape.mkv"},
        headers={"X-Session-Token": SESSION_TOKEN},
    )
    assert bad_res.status_code == 400

    # Test Enqueue valid path
    good_res = client.post(
        "/api/queue/enqueue",
        json={"input": "media/tape_01.mkv", "priority": 5},
        headers={"X-Session-Token": SESSION_TOKEN},
    )
    assert good_res.status_code == 200
    job_id = good_res.json()["job_id"]

    # Test Cancel job
    cancel_res = client.post(
        f"/api/queue/cancel/{job_id}",
        headers={"X-Session-Token": SESSION_TOKEN},
    )
    assert cancel_res.status_code == 200

    # Test Start and Stop worker
    start_res = client.post("/api/queue/start", headers={"X-Session-Token": SESSION_TOKEN})
    assert start_res.status_code == 200
    stop_res = client.post("/api/queue/stop", headers={"X-Session-Token": SESSION_TOKEN})
    assert stop_res.status_code == 200


def test_api_logs_stream(client):
    # Verify the SSE streaming endpoint responds with text/event-stream
    with client.stream("GET", "/api/logs/stream") as response:
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
        line = next(response.iter_lines())
        assert "connected" in line or "data:" in line


def test_api_hardware(client):
    response = client.get("/api/hardware")
    assert response.status_code == 200
    data = response.json()
    assert "tier" in data
    assert "tier_name" in data
    assert "cpu" in data
    assert "ram" in data
    assert "gpu" in data


def test_api_get_logs(client):
    response = client.get("/api/logs")
    assert response.status_code == 200
    data = response.json()
    assert "active" in data
    assert "logs" in data


@patch("vhs_studio.api.server.pm.start_process")
def test_api_run_endpoint(mock_start, client):
    mock_start.return_value = (True, "Started")
    response = client.post(
        "/api/run",
        json={"input": "media/raw/test.mkv", "deinterlacer": "bwdif"},
        headers={"X-Session-Token": SESSION_TOKEN},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_api_security_path_traversal_run(client):
    """Verify that path traversal attempts on /api/run are blocked."""
    for bad_path in ["media/../../etc/passwd", "media/tape\0.mkv", "C:/Windows/system32/cmd.exe"]:
        response = client.post(
            "/api/run",
            json={"input": bad_path},
            headers={"X-Session-Token": SESSION_TOKEN},
        )
        assert response.status_code == 400
        assert response.json()["message"] in ("Invalid or insecure file path.", "Caminho de arquivo inválido ou não seguro.")


def test_api_security_path_traversal_queue_enqueue(client):
    """Verify that path traversal attempts on /api/queue/enqueue are blocked."""
    for bad_path in ["media/../../etc/shadow", "media/tape\0.mkv", "outside/media/test.mkv"]:
        response = client.post(
            "/api/queue/enqueue",
            json={"input": bad_path},
            headers={"X-Session-Token": SESSION_TOKEN},
        )
        assert response.status_code == 400
        assert response.json()["error"] in ("Invalid or insecure file path.", "Caminho de arquivo inválido ou não seguro.")


def test_api_security_generate_subtitles_validation(client):
    """Verify that subtitle generation rejects insecure paths and validates model size."""
    # Insecure path
    res = client.post(
        "/api/action",
        json={"action": "generate_subtitles", "params": {"input": "media/../../etc/passwd"}},
        headers={"X-Session-Token": SESSION_TOKEN},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "error"
    assert res.json()["message"] in ("Invalid or insecure file path.", "Caminho de arquivo inválido ou não seguro.")

    # Valid execution
    with patch("vhs_studio.api.server.pm.start_process") as mock_start:
        mock_start.return_value = (True, "Started")
        ok_res = client.post(
            "/api/action",
            json={
                "action": "generate_subtitles",
                "params": {"input": "media/raw/tape.mkv", "model_size": "small"},
            },
            headers={"X-Session-Token": SESSION_TOKEN},
        )
        assert ok_res.status_code == 200
        assert ok_res.json()["status"] == "ok"
        mock_start.assert_called_once()
        called_cmd = mock_start.call_args[0][0]
        assert "subtitles" in called_cmd
        assert "media/raw/tape.mkv" in called_cmd
        assert "small" in called_cmd


def test_api_monitor_stream_proxy_security(client):
    """Verify that insecure paths in stream-proxy are rejected with 400."""
    res = client.get("/api/monitor/stream-proxy?source=../../etc/passwd")
    assert res.status_code == 400
    assert res.json()["message"] in ("Invalid or insecure file path.", "Caminho de arquivo inválido ou não seguro.")


def test_api_monitor_stream_proxy_stream(client):
    """Verify that /api/monitor/stream-proxy initiates a multipart MJPEG stream."""
    with patch("vhs_studio.core.toolchain.Toolchain.get_ffmpeg_path") as mock_ff, \
         patch("subprocess.Popen") as mock_popen:
        mock_ff.return_value = "ffmpeg"
        mock_proc = MagicMock()
        mock_proc.stdout.read.side_effect = [b"--frame\r\nContent-Type: image/jpeg\r\n\r\nfakejpeg\r\n", b""]
        mock_proc.wait.return_value = 0
        mock_popen.return_value = mock_proc

        with client.stream("GET", "/api/monitor/stream-proxy?mode=raw&fps=15") as res:
            assert res.status_code == 200
            assert "multipart/x-mixed-replace; boundary=frame" in res.headers["content-type"]
            chunk = next(res.iter_bytes())
            assert b"--frame" in chunk


def test_api_monitor_comparison_frame(client):
    """Verify that /api/monitor/comparison-frame returns valid base64 images."""
    with patch("vhs_studio.core.toolchain.Toolchain.get_ffmpeg_path") as mock_ff, \
         patch("subprocess.run") as mock_run:
        mock_ff.return_value = "ffmpeg"
        mock_res = MagicMock()
        mock_res.returncode = 0
        mock_res.stdout = b"\xff\xd8\xff\xe0\x00\x10JFIF"
        mock_run.return_value = mock_res

        res = client.get("/api/monitor/comparison-frame?timestamp=5.0")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert "data:image/jpeg;base64," in data["raw_image"]
        assert "data:image/jpeg;base64," in data["processed_image"]
        assert "duration" in data
        assert data["duration"] > 0


def test_find_existing_restored_master_and_comparison(client, tmp_path):
    """Verify _find_existing_restored_master locates restored master and get_comparison_frame uses it."""
    from vhs_studio.api.routers.restoration import _find_existing_restored_master

    # Non-existent or empty path
    assert _find_existing_restored_master("") is None
    assert _find_existing_restored_master(str(tmp_path / "nonexistent.mkv")) is None

    # Simulate existing raw and restored file in media/restored/<stem>/
    fake_raw = tmp_path / "tape123.mkv"
    fake_raw.write_bytes(b"dummy raw content")

    with patch("vhs_studio.api.routers.restoration.RESTORED_MEDIA_DIR", str(tmp_path / "restored")):
        restored_folder = tmp_path / "restored" / "tape123"
        restored_folder.mkdir(parents=True)
        restored_file = restored_folder / "tape123_restored_1080p.mp4"
        # Write > 100KB so it passes validation
        restored_file.write_bytes(b"0" * 150000)

        found = _find_existing_restored_master(str(fake_raw))
        assert found == str(restored_file)

        with patch("vhs_studio.core.toolchain.Toolchain.get_ffmpeg_path") as mock_ff, \
             patch("subprocess.run") as mock_run:
            mock_ff.return_value = "ffmpeg"
            mock_res = MagicMock()
            mock_res.returncode = 0
            mock_res.stdout = b"\xff\xd8\xff\xe0\x00\x10JFIF"
            mock_run.return_value = mock_res

            res = client.get("/api/monitor/comparison-frame", params={"source": str(fake_raw), "timestamp": 5.0})
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "ok"
            # Ensure subprocess was called with the restored file
            calls = mock_run.call_args_list
            assert any(restored_file.name in str(c) for c in calls)


def test_api_check_existing_restoration(client):
    """Verify /api/restoration/check-existing handles empty and queried requests."""
    res_empty = client.get("/api/restoration/check-existing")
    assert res_empty.status_code == 200
    assert res_empty.json() == {"has_existing": False}

    res_dummy = client.get("/api/restoration/check-existing?source=non_existent_tape.mkv")
    assert res_dummy.status_code == 200
    assert res_dummy.json() == {"has_existing": False}


def test_api_system_metrics(client):
    """Verify GET /api/system/metrics returns dynamic CPU, RAM and pipeline state."""
    res = client.get("/api/system/metrics")
    assert res.status_code == 200
    data = res.json()
    assert "cpu_percent" in data
    assert "ram_used_gb" in data
    assert "ram_total_gb" in data
    assert "ram_percent" in data
    assert "process_running" in data
    assert "is_paused" in data
    assert isinstance(data["cpu_percent"], (int, float))
    assert isinstance(data["ram_percent"], (int, float))


def test_preview_scale_filter_preserves_4_3_aspect_ratio():
    """Verify 4:3 SD VHS sources receive pillarbox padding and 16:9 HD sources receive 640:360 scale."""
    from vhs_studio.api.routers.restoration import _resolve_preview_scale_filter

    sd_filter = _resolve_preview_scale_filter("media/raw/vhs_ntsc_tape.mkv")
    assert "scale=w=480:h=360:force_original_aspect_ratio=decrease" in sd_filter
    assert "pad=640:360:(ow-iw)/2:(oh-ih)/2" in sd_filter

    hd_filter = _resolve_preview_scale_filter("media/restored/master_1080p.mp4")
    assert "scale=w=640:h=360:force_original_aspect_ratio=decrease" in hd_filter
    assert "pad=640:360:(ow-iw)/2:(oh-ih)/2" in hd_filter
