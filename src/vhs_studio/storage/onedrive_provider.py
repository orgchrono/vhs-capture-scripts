"""Module documentation pending."""

from typing import Dict
from .base import StorageProvider
from vhs_studio.core.logger import log
import os

try:
    from O365 import Account, FileSystemTokenBackend

    HAS_ONEDRIVE = True
except ImportError:
    HAS_ONEDRIVE = False


class OneDriveProvider(StorageProvider):
    """Documentation for OneDriveProvider."""

    def __init__(self):
        """Documentation for __init__."""
        self.account = None
        self.drive = None

    def get_id(self) -> str:
        """Documentation for get_id."""
        return "onedrive"

    def configure(self, config: Dict[str, object]) -> bool:
        """Documentation for configure."""
        if not HAS_ONEDRIVE:
            log.error("[OneDrive] Biblioteca 'O365' não instalada.")
            return False

        client_id = config.get("ONEDRIVE_CLIENT_ID")
        client_secret = config.get("ONEDRIVE_CLIENT_SECRET")
        tenant_id = config.get("ONEDRIVE_TENANT_ID", "common")

        if not client_id or not client_secret:
            log.error("[OneDrive] Client ID ou Secret ausentes.")
            return False

        try:
            credentials = (client_id, client_secret)
            # Vamos usar backend em memória ou no app data para os tokens
            token_path = os.path.join(
                os.path.expanduser("~"), ".vhs_studio", "onedrive_token.txt"
            )
            token_backend = FileSystemTokenBackend(
                token_path=os.path.dirname(token_path),
                token_filename=os.path.basename(token_path),
            )

            self.account = Account(
                credentials,
                auth_flow="client",
                tenant_id=tenant_id,
                token_backend=token_backend,
            )

            # Se fosse delegada, precisaria de authenticate(). Sendo 'client' (app mode), a lib autentica automágica
            if not self.account.is_authenticated:
                self.account.authenticate()

            self.drive = self.account.storage().get_default_drive()
            return True
        except Exception as e:
            log.error(f"[OneDrive] Falha na autenticação: {e}")
            return False

    def upload_video(self, local_filepath: str, destination_path: str) -> bool:
        """Documentation for upload_video."""
        if not self.drive:
            return False

        try:
            log.info(f"[OneDrive] Uploading {local_filepath}...")
            # Pega a pasta root ou cria caminho
            folder = self.drive.get_root_folder()
            # O365 suporta resumable upload para > 4MB
            folder.upload_file(
                local_filepath, item_name=os.path.basename(destination_path)
            )
            log.info("[OneDrive] Upload concluído.")
            return True
        except Exception as e:
            log.error(f"[OneDrive] Erro no upload: {e}")
            return False

    def get_status(self) -> Dict[str, object]:
        """Documentation for get_status."""
        return {"ready": self.drive is not None}
