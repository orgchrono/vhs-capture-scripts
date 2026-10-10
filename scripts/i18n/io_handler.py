"""Single Responsibility: I/O operations for locale JSON files."""

import json
import os
from typing import Dict, Any

SUPPORTED_LOCALES = [
    "pt-BR",
    "en-US",
    "es",
    "fr",
    "de",
    "it",
    "ja",
    "ar",
    "ru",
    "zh-CN",
]

LOCALES_BASE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "ui", "src", "locales")
)


def get_locale_path(locale: str) -> str:
    """Return the absolute file path for a locale's translation.json."""
    return os.path.join(LOCALES_BASE_DIR, locale, "translation.json")


def load_locale(locale: str) -> Dict[str, Any]:
    """Load and parse translation.json for a given locale."""
    path = get_locale_path(locale)
    if not os.path.exists(path):
        raise FileNotFoundError(f"Translation file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_locale(locale: str, data: Dict[str, Any]) -> None:
    """Serialize and write translation data to disk atomically."""
    path = get_locale_path(locale)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temp_path = f"{path}.tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(temp_path, path)
