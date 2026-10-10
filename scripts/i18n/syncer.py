"""Single Responsibility: Domain synchronization engine for locale dictionaries."""

from typing import Dict, Any
from scripts.i18n.io_handler import SUPPORTED_LOCALES, load_locale, save_locale


def sync_namespace(
    namespace: str,
    translations_by_locale: Dict[str, Dict[str, Any]],
) -> None:
    """Synchronize a specific namespace across all supported locales.

    Args:
        namespace: The root key namespace (e.g. 'recovery', 'console', 'toast').
        translations_by_locale: Mapping of locale to dictionary of key-value pairs.
    """
    for loc in SUPPORTED_LOCALES:
        if loc not in translations_by_locale:
            continue
        locale_data = load_locale(loc)
        if namespace not in locale_data:
            locale_data[namespace] = {}

        # Merge new keys into namespace
        locale_data[namespace].update(translations_by_locale[loc])
        save_locale(loc, locale_data)
