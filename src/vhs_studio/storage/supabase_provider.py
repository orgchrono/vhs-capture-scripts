"""Module documentation pending."""

from typing import Dict
from .base import StorageProvider
from vhs_studio.core.logger import log

try:
    from supabase import create_client

    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False


class SupabaseStorageProvider(StorageProvider):
    """Integration with Supabase Storage (Postgres-coupled object store)."""

    def __init__(self):
        """Initialize Supabase storage adapter."""
        self.client = None
        self.bucket_name = "vhs-archive"

    def get_id(self) -> str:
        """Return provider identifier."""
        return "supabase"

    def configure(self, config: Dict[str, object]) -> bool:
        """Configure Supabase credentials and verify target bucket."""
        if not HAS_SUPABASE:
            log.error("[Supabase] Package 'supabase' is not installed.")
            return False
        url = str(config.get("SUPABASE_URL", ""))
        key = str(config.get("SUPABASE_KEY", ""))
        bucket = str(config.get("SUPABASE_BUCKET", self.bucket_name))
        if not url or not key:
            log.error("[Supabase] Missing SUPABASE_URL or SUPABASE_KEY credentials.")
            return False
        try:
            self.client = create_client(url, key)
            self.bucket_name = bucket
            # Check if bucket exists, creating it if absent
            buckets = self.client.storage.list_buckets()
            if not any(b.name == bucket for b in buckets):
                self.client.storage.create_bucket(bucket)
            return True
        except Exception as e:
            log.error(f"[Supabase] Failed to connect/configure: {e}")
            return False

    def upload_video(self, local_filepath: str, destination_path: str) -> bool:
        """Documentation for upload_video."""
        if not self.client:
            return False
        try:
            log.info(
                f"[Supabase] Uploading {local_filepath} to bucket {self.bucket_name}..."
            )
            with open(local_filepath, "rb") as f:
                self.client.storage.from_(self.bucket_name).upload(
                    file=f,
                    path=destination_path,
                    file_options={"content-type": "video/mp4"},
                )
            log.info("[Supabase] Upload completed successfully.")
            return True
        except Exception as e:
            log.error(f"[Supabase] Upload failed: {e}")
            return False

    def get_status(self) -> Dict[str, object]:
        """Documentation for get_status."""
        return {"ready": self.client is not None, "bucket": self.bucket_name}
