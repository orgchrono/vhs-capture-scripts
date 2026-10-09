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
    assert data["message"] == "Unknown action."


def test_api_action_stop_process_none_running(client):
    response = client.post(
        "/api/action",
        json={"action": "stop_process"},
        headers={"X-Session-Token": SESSION_TOKEN},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert data["message"] == "No process currently running."


def test_api_action_start_restore_invalid_file(client):
    response = client.post(
        "/api/action",
        json={"action": "start_restore", "params": {"input": "invalid_path"}},
        headers={"X-Session-Token": SESSION_TOKEN},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert data["message"] == "Invalid or insecure file path."


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
        assert response.json()["message"] == "Invalid or insecure file path."


def test_api_security_path_traversal_queue_enqueue(client):
    """Verify that path traversal attempts on /api/queue/enqueue are blocked."""
    for bad_path in ["media/../../etc/shadow", "media/tape\0.mkv", "outside/media/test.mkv"]:
        response = client.post(
            "/api/queue/enqueue",
            json={"input": bad_path},
            headers={"X-Session-Token": SESSION_TOKEN},
        )
        assert response.status_code == 400
        assert response.json()["error"] == "Invalid or insecure file path."


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
    assert res.json()["message"] == "Invalid or insecure file path."

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
        assert "sys.argv[1]" in called_cmd[2]
        assert called_cmd[3] == "media/raw/tape.mkv"
        assert called_cmd[4] == "small"
