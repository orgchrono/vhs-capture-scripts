import os
from typing import Dict, Any
from .base import StorageProvider
from vhs_studio.core.logger import log

try:
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    from google.oauth2.credentials import Credentials
    import keyring

    HAS_GDRIVE = True
except ImportError:
    HAS_GDRIVE = False


class GoogleDriveProvider(StorageProvider):
    def __init__(self):
        self.service = None

    def get_id(self) -> str:
        return "gdrive"

    def configure(self, config: Dict[str, Any]) -> bool:
        if not HAS_GDRIVE:
            log.error("[GDrive] Dependências do Google não instaladas.")
            return False

        try:
            token = keyring.get_password("vhs_studio", "gdrive_token")
            if not token:
                log.warning("[GDrive] Nenhum token OAuth salvo no keyring.")
                return False

            import json

            creds_data = json.loads(token)
            creds = Credentials.from_authorized_user_info(creds_data)
            self.service = build("drive", "v3", credentials=creds)
            return True
        except Exception as e:
            log.error(f"[GDrive] Erro ao configurar: {e}")
            return False

    def upload_video(self, local_filepath: str, destination_path: str) -> bool:
        if not self.service:
            log.error("[GDrive] Serviço não inicializado.")
            return False

        try:
            file_metadata = {"name": os.path.basename(destination_path)}
            media = MediaFileUpload(local_filepath, resumable=True)
            log.info(f"[GDrive] Iniciando upload: {local_filepath} ...")

            # TODO: Lidar com pastas (parents) no Drive
            file = self.service.files().create(body=file_metadata, media_body=media, fields="id").execute()
            log.info(f"[GDrive] Upload concluído. File ID: {file.get('id')}")
            return True
        except Exception as e:
            log.error(f"[GDrive] Erro no upload: {e}")
            return False

    def get_status(self) -> Dict[str, Any]:
        return {"ready": self.service is not None}
