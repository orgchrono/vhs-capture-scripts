"""Single Responsibility: Structural validation and parity checking across all locale files."""

from typing import Dict, Any, List, Set
from scripts.i18n.io_handler import SUPPORTED_LOCALES, load_locale


def flatten_keys(data: Dict[str, Any], prefix: str = "") -> Set[str]:
    """Flatten nested dictionary keys into dot-separated paths."""
    keys: Set[str] = set()
    for k, v in data.items():
        full_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys.update(flatten_keys(v, full_key))
        else:
            keys.add(full_key)
    return keys


def validate_locale_parity(reference_locale: str = "pt-BR") -> Dict[str, List[str]]:
    """Verify that all supported locales define exactly the same keys as the reference locale.

    Returns:
        Dictionary mapping locale names to lists of missing keys.
    """
    ref_data = load_locale(reference_locale)
    ref_keys = flatten_keys(ref_data)

    discrepancies: Dict[str, List[str]] = {}

    for loc in SUPPORTED_LOCALES:
        if loc == reference_locale:
            continue
        try:
            loc_data = load_locale(loc)
            loc_keys = flatten_keys(loc_data)
            missing = sorted(list(ref_keys - loc_keys))
            if missing:
                discrepancies[loc] = missing
        except FileNotFoundError:
            discrepancies[loc] = ["FILE_MISSING"]

    return discrepancies
