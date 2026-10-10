"""Unit tests for preferences configuration and persistence API."""

import json
from unittest.mock import patch
from fastapi.testclient import TestClient

from vhs_studio.config.preferences_config import (
    load_preferences,
    save_preferences,
    DEFAULT_PREFERENCES,
)
from vhs_studio.api.server import app


def test_preferences_load_defaults(tmp_path):
    fake_config = tmp_path / "preferences.json"
    with patch("vhs_studio.config.preferences_config.PREFERENCES_CONFIG_PATH", str(fake_config)):
        prefs = load_preferences()
        assert prefs["theme"] == "dark"
        assert prefs["max_console_lines"] == 500
        assert prefs["maxConsoleLines"] == 500


def test_preferences_save_and_reload(tmp_path):
    fake_config = tmp_path / "preferences.json"
    with patch("vhs_studio.config.preferences_config.PREFERENCES_CONFIG_PATH", str(fake_config)):
        save_preferences({
            "theme": "oled_black",
            "maxConsoleLines": 800,
            "previewFps": 60,
        })

        assert fake_config.exists()
        with open(fake_config, "r", encoding="utf-8") as f:
            data = json.load(f)
            assert data["theme"] == "oled_black"
            assert data["max_console_lines"] == 800
            assert data["preview_fps"] == 60

        reloaded = load_preferences()
        assert reloaded["theme"] == "oled_black"
        assert reloaded["maxConsoleLines"] == 800
        assert reloaded["max_console_lines"] == 800


def test_preferences_api_endpoints(tmp_path):
    fake_config = tmp_path / "preferences.json"
    client = TestClient(app)

    with patch("vhs_studio.config.preferences_config.PREFERENCES_CONFIG_PATH", str(fake_config)):
        res_get = client.get("/api/preferences")
        assert res_get.status_code == 200
        data = res_get.json()
        assert "theme" in data

        res_post = client.post(
            "/api/preferences",
            json={"theme": "oled_black", "highContrast": True},
        )
        assert res_post.status_code == 200
        resp_json = res_post.json()
        assert resp_json["success"] is True
        assert resp_json["preferences"]["theme"] == "oled_black"
        assert resp_json["preferences"]["highContrast"] is True
