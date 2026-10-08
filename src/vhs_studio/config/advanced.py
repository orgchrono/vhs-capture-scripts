import os
from pathlib import Path
from vhs_studio.core.logger import log

try:
    import tomllib
except ModuleNotFoundError:
    try:
        import tomli as tomllib
    except ImportError:
        tomllib = None

# Procura o arquivo ao lado do __main__ ou na pasta do usuário
USER_DIR = os.path.join(os.path.expanduser("~"), ".vhs_studio")
CONFIG_PATHS = [
    os.path.join(os.getcwd(), "vhs_advanced_config.toml"),
    os.path.join(USER_DIR, "vhs_advanced_config.toml")
]

class AdvancedConfig:
    _data = None

    @classmethod
    def load(cls):
        if cls._data is not None:
            return cls._data
            
        if tomllib is None:
            log.warning("[TOML] Biblioteca tomllib/tomli ausente. Usando valores padrões.")
            cls._data = {}
            return cls._data

        for p in CONFIG_PATHS:
            if os.path.exists(p):
                try:
                    with open(p, "rb") as f:
                        cls._data = tomllib.load(f)
                        log.info(f"[Config] Configurações avançadas carregadas de {p}")
                        return cls._data
                except Exception as e:
                    log.error(f"[Config] Erro ao ler TOML ({p}): {e}")
                    
        # Fallback para dicionário vazio
        cls._data = {}
        return cls._data

    @classmethod
    def get(cls, section: str, key: str, default):
        data = cls.load()
        try:
            return data.get(section, {}).get(key, default)
        except AttributeError:
            return default