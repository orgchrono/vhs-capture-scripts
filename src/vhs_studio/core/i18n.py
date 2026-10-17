"""Internationalization (i18n) runtime provider for VHS Studio Python backend.

Encapsulates locale state and translation dictionary caching inside a lexical
closure (make_i18n_provider) to eliminate global mutable state and side-effects.
"""

import json
import os
from typing import Any, Callable, Dict, Optional, Tuple
from vhs_studio.core.paths import PROJECT_ROOT

LOCALES_DIR = os.path.join(PROJECT_ROOT, "ui", "src", "locales")


def make_i18n_provider(
    default_locale: str = "pt-BR",
    locales_dir: str = LOCALES_DIR,
) -> Tuple[
    Callable[[str], None],
    Callable[[], str],
    Callable[[str], Dict[str, Any]],
    Callable[..., str],
]:
    """Create a closure-backed i18n provider with isolated locale and dictionary cache."""
    state: Dict[str, str] = {"locale": default_locale}
    cache: Dict[str, Dict[str, Any]] = {}

    def set_locale(locale: str) -> None:
        """Set active backend locale (e.g. 'pt-BR', 'en-US') inside closure state."""
        state["locale"] = locale

    def get_locale() -> str:
        """Return active backend locale from closure state."""
        return state["locale"]

    def load_locale_dict(locale: str) -> Dict[str, Any]:
        """Load translation JSON dictionary for given locale using closure cache."""
        if locale in cache:
            return dict(cache[locale])

        path = os.path.join(locales_dir, locale, "translation.json")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        cache[locale] = data
                        return dict(data)
            except Exception:
                pass

        if locale != "en-US":
            return load_locale_dict("en-US")
        return {}

    def translate(key: str, default: Optional[str] = None, **kwargs: Any) -> str:
        """Translate dot-separated translation key into active locale string."""
        loc_dict = load_locale_dict(state["locale"])
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

    return set_locale, get_locale, load_locale_dict, translate


set_locale, get_locale, load_locale_dict, t = make_i18n_provider()
