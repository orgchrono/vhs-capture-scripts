import sys
import os

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
    _config = None

    @classmethod
    def load(cls):
        if cls._config is not None:
            return cls._config

        base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        toml_path = os.path.join(base_path, "vhs_advanced_config.toml")

        if os.path.exists(toml_path):
            try:
                with open(toml_path, "rb") as f:
                    cls._config = tomllib.load(f)
            except Exception:
                cls._config = {}
        else:
            cls._config = {}

        return cls._config

    @classmethod
    def get(cls, section: str, key: str, default=None):
        config = cls.load()
        return config.get(section, {}).get(key, default)
