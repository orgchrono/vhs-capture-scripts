"""Internationalization tooling package adhering to SRP and SoC principles."""

from scripts.i18n.io_handler import (
    SUPPORTED_LOCALES,
    load_locale,
    save_locale,
    get_locale_path,
)
from scripts.i18n.validator import validate_locale_parity, flatten_keys
from scripts.i18n.syncer import sync_namespace

__all__ = [
    "SUPPORTED_LOCALES",
    "load_locale",
    "save_locale",
    "get_locale_path",
    "validate_locale_parity",
    "flatten_keys",
    "sync_namespace",
]
