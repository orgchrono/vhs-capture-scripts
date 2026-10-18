"""OneDrive Cloud Storage Provider implementation."""

from typing import Dict, Any, Optional
from .base import StorageProvider
from vhs_studio.core.logger import log
from vhs_studio.core.paths import VHS_STUDIO_DIR
import os

try:
    from O365 import Account, FileSystemTokenBackend

    HAS_ONEDRIVE = True
except ImportError:
    HAS_ONEDRIVE = False


class OneDriveProvider(StorageProvider):
    """Storage provider for Microsoft OneDrive via Microsoft Graph / O365 API."""

    def __init__(self) -> None:
        """Initialize OneDrive provider state."""
        self.account: Optional[Any] = None
        self.drive: Optional[Any] = None

    def get_id(self) -> str:
        """Return unique provider identifier."""
        return "onedrive"

    def configure(self, config: Dict[str, object]) -> bool:
        """Configure credentials and authenticate with Microsoft Graph API."""
        if not HAS_ONEDRIVE:
            log.error("[OneDrive] 'O365' package is not installed.")
            return False

        client_id = config.get("ONEDRIVE_CLIENT_ID")
        client_secret = config.get("ONEDRIVE_CLIENT_SECRET")
        tenant_id = config.get("ONEDRIVE_TENANT_ID", "common")

        if not client_id or not client_secret:
            log.error("[OneDrive] Missing Client ID or Client Secret.")
            return False

        try:
            credentials = (client_id, client_secret)
            # Store authentication tokens inside app data directory
            token_path = os.path.join(VHS_STUDIO_DIR, "onedrive_token.txt")
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

            # In client credentials flow, authentication is performed via token backend
            if not self.account.is_authenticated:
                self.account.authenticate()

            self.drive = self.account.storage().get_default_drive()
            return True
        except Exception as e:
            log.error(f"[OneDrive] Authentication failed: {e}")
            return False

    def upload_video(self, local_filepath: str, destination_path: str) -> bool:
        """Upload video file to OneDrive root or target folder."""
        if not self.drive:
            return False

        try:
            log.info(f"[OneDrive] Uploading {local_filepath}...")
            folder = self.drive.get_root_folder()
            # O365 library supports chunked resumable upload for files > 4MB
            folder.upload_file(
                local_filepath, item_name=os.path.basename(destination_path)
            )
            log.info("[OneDrive] Upload completed successfully.")
            return True
        except Exception as e:
            log.error(f"[OneDrive] Upload error: {e}")
            return False

    def get_status(self) -> Dict[str, object]:
        """Return provider connection readiness status."""
        return {"ready": self.drive is not None}
