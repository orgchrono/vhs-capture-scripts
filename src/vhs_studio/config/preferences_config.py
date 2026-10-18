"""Global program preferences configuration persistence handler."""

import json
import os
from typing import Dict, Mapping
from vhs_studio.core.logger import log
from vhs_studio.core.paths import PREFERENCES_CONFIG_PATH

CAMEL_TO_SNAKE: Dict[str, str] = {
    "rawDir": "raw_dir",
    "restoredDir": "restored_dir",
    "cacheDir": "cache_dir",
    "livePreviewEnabled": "live_preview_enabled",
    "previewFps": "preview_fps",
    "verboseConsole": "verbose_console",
    "autoScrollConsole": "auto_scroll_console",
    "maxConsoleLines": "max_console_lines",
    "panasonicHotplugEnabled": "panasonic_hotplug_enabled",
    "panasonicPollIntervalMs": "panasonic_poll_interval_ms",
    "preferredAiDevice": "preferred_ai_device",
    "whisperMaxThreads": "whisper_max_threads",
    "hardwareEncoderPreference": "hardware_encoder_preference",
    "highContrast": "high_contrast",
    "largeText": "large_text",
    "theme": "theme",
}

SNAKE_TO_CAMEL: Dict[str, str] = {v: k for k, v in CAMEL_TO_SNAKE.items()}

DEFAULT_PREFERENCES: Dict[str, object] = {
    "raw_dir": "",
    "restored_dir": "",
    "cache_dir": "",
    "live_preview_enabled": True,
    "preview_fps": 30,
    "verbose_console": False,
    "auto_scroll_console": True,
    "max_console_lines": 500,
    "panasonic_hotplug_enabled": True,
    "panasonic_poll_interval_ms": 3000,
    "preferred_ai_device": "auto",
    "whisper_max_threads": 4,
    "hardware_encoder_preference": "auto",
    "high_contrast": False,
    "large_text": False,
    "theme": "dark",
}


def load_preferences() -> Dict[str, object]:
    """Retrieve persisted preferences from disk or return defaults with camelCase mirrors."""
    merged = dict(DEFAULT_PREFERENCES)
    if os.path.exists(PREFERENCES_CONFIG_PATH):
        try:
            with open(PREFERENCES_CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    for k, v in data.items():
                        snake_k = CAMEL_TO_SNAKE.get(str(k), str(k))
                        merged[snake_k] = v
        except Exception as err:
            log.warning(f"[PREFERENCES] Error reading preferences.json ({err}). Using defaults.")

    # Populate camelCase mirrors for seamless frontend consumption
    for s_key, c_key in SNAKE_TO_CAMEL.items():
        if s_key in merged:
            merged[c_key] = merged[s_key]
    return merged


def save_preferences(prefs: Mapping[str, object]) -> bool:
    """Persist updated preferences dictionary to disk, normalizing keys to snake_case."""
    try:
        os.makedirs(os.path.dirname(PREFERENCES_CONFIG_PATH), exist_ok=True)
        current = dict(DEFAULT_PREFERENCES)

        # Load existing disk values if file exists
        if os.path.exists(PREFERENCES_CONFIG_PATH):
            try:
                with open(PREFERENCES_CONFIG_PATH, "r", encoding="utf-8") as f:
                    disk_data = json.load(f)
                    if isinstance(disk_data, dict):
                        for k, v in disk_data.items():
                            snake_k = CAMEL_TO_SNAKE.get(str(k), str(k))
                            current[snake_k] = v
            except Exception:
                pass

        # Apply new preferences (normalizing any camelCase keys)
        for k, v in prefs.items():
            snake_k = CAMEL_TO_SNAKE.get(str(k), str(k))
            current[snake_k] = v

        # Only persist pure snake_case keys to file
        disk_payload = {k: v for k, v in current.items() if k in DEFAULT_PREFERENCES}

        with open(PREFERENCES_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(disk_payload, f, indent=2, ensure_ascii=False)
        return True
    except Exception as err:
        log.error(f"[PREFERENCES] Falha ao salvar preferences.json: {err}")
        return False
