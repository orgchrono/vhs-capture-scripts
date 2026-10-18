"""Module documentation pending."""

import os
import shutil
from typing import Dict
from .base import StorageProvider
from vhs_studio.core.logger import log


class LocalStorageProvider(StorageProvider):
    """Handles external HDDs, USB flash drives, and OS-mapped NAS (Network Attached Storage)."""

    def __init__(self):
        """Initialize LocalStorageProvider instance."""
        self.base_path = ""
        self.is_ready = False

    def get_id(self) -> str:
        """Return provider identifier."""
        return "local_nas_usb"

    def configure(self, config: Dict[str, object]) -> bool:
        """Configure local storage path and verify accessibility."""
        path = str(config.get("path", ""))
        if not path:
            log.error(
                "[LocalStorage] Destination path not provided in configuration."
            )
            return False
        if not os.path.exists(path):
            try:
                os.makedirs(path, exist_ok=True)
            except Exception as e:
                log.error(
                    f"[LocalStorage] Failed to create or access NAS/USB directory: {e}"
                )
                return False
        self.base_path = path
        self.is_ready = True
        return True

    def upload_video(self, local_filepath: str, destination_path: str) -> bool:
        """Copy video file to local or mapped destination directory."""
        if not self.is_ready:
            log.error("[LocalStorage] Provider is not configured.")
            return False
        dest = os.path.join(self.base_path, destination_path)
        dest_dir = os.path.dirname(dest)
        try:
            os.makedirs(dest_dir, exist_ok=True)
            log.info(f"[LocalStorage] Copying {local_filepath} to {dest} ...")
            shutil.copy2(local_filepath, dest)
            log.info("[LocalStorage] Copy completed successfully.")
            return True
        except Exception as e:
            log.error(f"[LocalStorage] Error copying file: {e}")
            return False

    def get_status(self) -> Dict[str, object]:
        """Documentation for get_status."""
        if not self.is_ready or not os.path.exists(self.base_path):
            return {"ready": False, "free_space_gb": 0}
        total, used, free = shutil.disk_usage(self.base_path)
        free_gb = free // (2**30)
        return {"ready": True, "free_space_gb": free_gb, "path": self.base_path}
