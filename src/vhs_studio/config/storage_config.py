import json
import os
from vhs_studio.core.logger import log

CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".vhs_studio", "storage.json")

def load_storage_config():
    if not os.path.exists(CONFIG_PATH):
        return {"provider": "local_nas_usb", "config": {"path": os.path.join(os.path.expanduser("~"), "Videos", "VHS_Archive")}}
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log.error(f"Erro ao carregar storage.json: {e}")
        return {"provider": "local_nas_usb", "config": {}}

def save_storage_config(provider: str, config: dict):
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    data = {"provider": provider, "config": config}
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        return True
    except Exception as e:
        log.error(f"Erro ao salvar storage.json: {e}")
        return False