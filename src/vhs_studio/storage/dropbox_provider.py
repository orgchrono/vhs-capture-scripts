"""Module documentation pending."""

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
    """Documentation for DropboxProvider."""

    def __init__(self):
        """Documentation for __init__."""
        self.dbx = None

    def get_id(self) -> str:
        """Documentation for get_id."""
        return "dropbox"

    def configure(self, config: Dict[str, object]) -> bool:
        """Documentation for configure."""
        if not HAS_DROPBOX:
            log.error("[Dropbox] Package 'dropbox' is not installed.")
            return False

        token = config.get("DROPBOX_ACCESS_TOKEN")
        if not token:
            log.error("[Dropbox] Access Token is missing.")
            return False

        try:
            self.dbx = dropbox.Dropbox(token)
            # Test connection
            self.dbx.users_get_current_account()
            return True
        except Exception as e:
            log.error(f"[Dropbox] Authentication error: {e}")
            return False

    def upload_video(self, local_filepath: str, destination_path: str) -> bool:
        """Upload video file to Dropbox destination path."""
        if not self.dbx:
            return False

        try:
            # Dropbox API requires destination paths to begin with /
            if not destination_path.startswith("/"):
                destination_path = "/" + destination_path

            log.info(
                f"[Dropbox] Starting upload from {local_filepath} to {destination_path}..."
            )

            # For large files, use an upload session
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
                    upload_session_start_result = self.dbx.files_upload_session_start(
                        f.read(CHUNK_SIZE)
                    )
                    cursor = dropbox.files.UploadSessionCursor(
                        session_id=upload_session_start_result.session_id,
                        offset=f.tell(),
                    )
                    commit = dropbox.files.CommitInfo(
                        path=destination_path, mode=dropbox.files.WriteMode.overwrite
                    )

                    while f.tell() < file_size:
                        if (file_size - f.tell()) <= CHUNK_SIZE:
                            self.dbx.files_upload_session_finish(
                                f.read(CHUNK_SIZE), cursor, commit
                            )
                        else:
                            self.dbx.files_upload_session_append_v2(
                                f.read(CHUNK_SIZE), cursor
                            )
                            cursor.offset = f.tell()

            log.info("[Dropbox] Upload completed successfully.")
            return True
        except Exception as e:
            log.error(f"[Dropbox] Upload error: {e}")
            return False

    def get_status(self) -> Dict[str, object]:
        """Documentation for get_status."""
        return {"ready": self.dbx is not None}
