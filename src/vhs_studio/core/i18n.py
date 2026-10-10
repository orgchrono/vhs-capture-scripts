"""Internationalization (i18n) runtime provider for VHS Studio Python backend."""

import json
import os
from typing import Any, Dict, Optional
from vhs_studio.core.paths import PROJECT_ROOT

LOCALES_DIR = os.path.join(PROJECT_ROOT, "ui", "src", "locales")
_CACHE: Dict[str, Dict[str, Any]] = {}
_CURRENT_LOCALE = "pt-BR"


def set_locale(locale: str) -> None:
    """Set active backend locale (e.g. 'pt-BR', 'en-US')."""
    global _CURRENT_LOCALE
    _CURRENT_LOCALE = locale


def get_locale() -> str:
    """Return active backend locale."""
    return _CURRENT_LOCALE


def load_locale_dict(locale: str) -> Dict[str, Any]:
    """Load translation JSON dictionary for given locale."""
    if locale in _CACHE:
        return _CACHE[locale]

    path = os.path.join(LOCALES_DIR, locale, "translation.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                _CACHE[locale] = data
                return data
        except Exception:
            pass

    # Fallback to en-US or pt-BR if current locale fails
    if locale != "en-US":
        return load_locale_dict("en-US")
    return {}


def t(key: str, default: Optional[str] = None, **kwargs: Any) -> str:
    """Translate dot-separated translation key into active locale string.

    Args:
        key: Dot-separated namespace key (e.g. 'build.compiler_not_found').
        default: Fallback string if key is not found in dictionary.
        **kwargs: Variables for template interpolation.

    Returns:
        Translated and formatted string.
    """
    loc_dict = load_locale_dict(_CURRENT_LOCALE)
    parts = key.split(".")
    val: Any = loc_dict
    for p in parts:
        if isinstance(val, dict) and p in val:
            val = val[p]
        else:
            val = None
            break

    if val is None or not isinstance(val, str):
        val = default if default is not None else key

    if kwargs:
        try:
            val = val.format(**kwargs)
        except Exception:
            pass

    return str(val)
