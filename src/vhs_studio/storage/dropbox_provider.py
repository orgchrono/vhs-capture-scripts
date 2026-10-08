from typing import Dict
from .base import StorageProvider
from vhs_studio.core.logger import log
import os

try:
    import dropbox

    HAS_DROPBOX = True
except ImportError:
    HAS_DROPBOX = False


class DropboxProvider(StorageProvider):
    def __init__(self):
        self.dbx = None

    def get_id(self) -> str:
        return "dropbox"

    def configure(self, config: Dict[str, object]) -> bool:
        if not HAS_DROPBOX:
            log.error("[Dropbox] Biblioteca 'dropbox' não instalada.")
            return False

        token = config.get("DROPBOX_ACCESS_TOKEN")
        if not token:
            log.error("[Dropbox] Access Token ausente.")
            return False

        try:
            self.dbx = dropbox.Dropbox(token)
            # Testa a conexão
            self.dbx.users_get_current_account()
            return True
        except Exception as e:
            log.error(f"[Dropbox] Erro de autenticação: {e}")
            return False

    def upload_video(self, local_filepath: str, destination_path: str) -> bool:
        if not self.dbx:
            return False

        try:
            # Dropbox API precisa que caminhos comecem com /
            if not destination_path.startswith("/"):
                destination_path = "/" + destination_path

            log.info(f"[Dropbox] Iniciando upload de {local_filepath} para {destination_path}...")

            # Para arquivos grandes, usar upload session
            file_size = os.path.getsize(local_filepath)
            CHUNK_SIZE = 4 * 1024 * 1024

            with open(local_filepath, "rb") as f:
                if file_size <= CHUNK_SIZE:
                    self.dbx.files_upload(
                        f.read(),
                        destination_path,
                        mode=dropbox.files.WriteMode.overwrite,
                    )
                else:
                    upload_session_start_result = self.dbx.files_upload_session_start(f.read(CHUNK_SIZE))
                    cursor = dropbox.files.UploadSessionCursor(
                        session_id=upload_session_start_result.session_id,
                        offset=f.tell(),
                    )
                    commit = dropbox.files.CommitInfo(path=destination_path, mode=dropbox.files.WriteMode.overwrite)

                    while f.tell() < file_size:
                        if (file_size - f.tell()) <= CHUNK_SIZE:
                            self.dbx.files_upload_session_finish(f.read(CHUNK_SIZE), cursor, commit)
                        else:
                            self.dbx.files_upload_session_append_v2(f.read(CHUNK_SIZE), cursor)
                            cursor.offset = f.tell()

            log.info("[Dropbox] Upload concluído com sucesso.")
            return True
        except Exception as e:
            log.error(f"[Dropbox] Erro no upload: {e}")
            return False

    def get_status(self) -> Dict[str, object]:
        return {"ready": self.dbx is not None}
