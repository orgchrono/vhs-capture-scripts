"""Module documentation pending."""
import sys
import os
from vhs_studio.core.paths import ADVANCED_CONFIG_PATH

# Compatibilidade de import para tomllib (Nativo no Python 3.11+, tomli no 3.10)
try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib  # type: ignore
    except ImportError:
        print("FATAL: tomllib e tomli ausentes.")
        sys.exit(1)


class AdvancedConfig:
    """Documentation for AdvancedConfig."""
    _config = None

    @classmethod
    def load(cls):
        """Documentation for load."""
        if cls._config is not None:
            return cls._config

        if os.path.exists(ADVANCED_CONFIG_PATH):
            try:
                with open(ADVANCED_CONFIG_PATH, "rb") as f:
                    cls._config = tomllib.load(f)
            except Exception:
                cls._config = {}
        else:
            cls._config = {}

        return cls._config

    @classmethod
    def get(cls, section: str, key: str, default=None):
        """Documentation for get."""
        config = cls.load()
        return config.get(section, {}).get(key, default)
