"""Module documentation pending."""

import os
import shutil
from typing import Dict
from .base import StorageProvider
from vhs_studio.core.logger import log


class LocalStorageProvider(StorageProvider):
    """Lida com HDDs Externos, Pendrives USB e NAS (Network Attached Storage) mapeados no SO."""

    def __init__(self):
        """Documentation for __init__."""
        self.base_path = ""
        self.is_ready = False

    def get_id(self) -> str:
        """Documentation for get_id."""
        return "local_nas_usb"

    def configure(self, config: Dict[str, object]) -> bool:
        """Documentation for configure."""
        path = str(config.get("path", ""))
        if not path:
            log.error(
                "[LocalStorage] Caminho de destino não fornecido na configuração."
            )
            return False
        if not os.path.exists(path):
            try:
                os.makedirs(path, exist_ok=True)
            except Exception as e:
                log.error(
                    f"[LocalStorage] Falha ao criar/acessar diretório NAS/USB: {e}"
                )
                return False
        self.base_path = path
        self.is_ready = True
        return True

    def upload_video(self, local_filepath: str, destination_path: str) -> bool:
        """Documentation for upload_video."""
        if not self.is_ready:
            log.error("[LocalStorage] Provedor não está configurado.")
            return False
        dest = os.path.join(self.base_path, destination_path)
        dest_dir = os.path.dirname(dest)
        try:
            os.makedirs(dest_dir, exist_ok=True)
            log.info(f"[LocalStorage] Copiando {local_filepath} para {dest} ...")
            shutil.copy2(local_filepath, dest)
            log.info("[LocalStorage] Cópia concluída com sucesso.")
            return True
        except Exception as e:
            log.error(f"[LocalStorage] Erro ao copiar arquivo: {e}")
            return False

    def get_status(self) -> Dict[str, object]:
        """Documentation for get_status."""
        if not self.is_ready or not os.path.exists(self.base_path):
            return {"ready": False, "free_space_gb": 0}
        total, used, free = shutil.disk_usage(self.base_path)
        free_gb = free // (2**30)
        return {"ready": True, "free_space_gb": free_gb, "path": self.base_path}
