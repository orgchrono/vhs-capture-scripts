"""Module documentation pending."""

import json
import os
import keyring
from vhs_studio.core.logger import log
from vhs_studio.core.paths import STORAGE_CONFIG_PATH

# Fields that must NEVER be persisted in plain text
SENSITIVE_KEYS = {
    "SUPABASE_KEY",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "DROPBOX_ACCESS_TOKEN",
    "DROPBOX_APP_SECRET",
    "DROPBOX_REFRESH_TOKEN",
    "ONEDRIVE_CLIENT_SECRET",
    "ONEDRIVE_REFRESH_TOKEN",
    "GDRIVE_CLIENT_SECRET",
    "GDRIVE_REFRESH_TOKEN",
}


def load_storage_config():
    """Load storage configuration and decrypt sensitive credentials from system vault."""
    if not os.path.exists(STORAGE_CONFIG_PATH):
        return {
            "provider": "local_nas_usb",
            "config": {
                "path": os.path.join(os.path.expanduser("~"), "Videos", "VHS_Archive")
            },
        }

    try:
        with open(STORAGE_CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)

        provider = data.get("provider", "local_nas_usb")
        config = data.get("config", {})

        # Retrieve secrets from OS native keychain/vault (Keyring)
        for key in SENSITIVE_KEYS:
            try:
                secret = keyring.get_password("vhs_studio", f"{provider}_{key}")
                if secret:
                    config[key] = secret
            except Exception as e:
                log.warning(f"[StorageConfig] Error reading secret {key} from keyring: {e}")

        data["config"] = config
        return data
    except Exception as e:
        log.error(f"Error loading storage.json: {e}")
        return {"provider": "local_nas_usb", "config": {}}


def save_storage_config(provider: str, config: dict):
    """Save storage configuration and delegate sensitive credentials to OS native keychain/vault."""
    os.makedirs(os.path.dirname(STORAGE_CONFIG_PATH), exist_ok=True)

    public_config = {}

    for k, v in config.items():
        if k in SENSITIVE_KEYS:
            # Store into OS native keyring (Windows Credential Manager / macOS Keychain / Linux Secret Service)
            if v:
                try:
                    keyring.set_password("vhs_studio", f"{provider}_{k}", v)
                except Exception as e:
                    log.error(f"[StorageConfig] Failed storing secret in secure keyring: {e}")
            else:
                try:
                    keyring.delete_password("vhs_studio", f"{provider}_{k}")
                except Exception:
                    pass
        else:
            public_config[k] = v

    data = {"provider": provider, "config": public_config}

    try:
        with open(STORAGE_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        return True
    except Exception as e:
        log.error(f"Error saving storage.json: {e}")
        return False
