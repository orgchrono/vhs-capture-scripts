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
    assert data["message"] == "Ação desconhecida."


def test_api_action_stop_process_none_running(client):
    response = client.post(
        "/api/action",
        json={"action": "stop_process"},
        headers={"X-Session-Token": SESSION_TOKEN},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert data["message"] == "Nenhum processo rodando."


def test_api_action_start_restore_invalid_file(client):
    response = client.post(
        "/api/action",
        json={"action": "start_restore", "params": {"input": "invalid_path"}},
        headers={"X-Session-Token": SESSION_TOKEN},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert data["message"] == "Caminho de arquivo inválido ou inseguro."
