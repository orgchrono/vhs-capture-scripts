from typing import Dict, Any
from .base import StorageProvider
from vhs_studio.core.logger import log

try:
    from supabase import create_client, Client

    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False


class SupabaseStorageProvider(StorageProvider):
    """Integração com Supabase Storage (Object Storage acoplado ao Postgres)."""

    def __init__(self):
        self.client = None
        self.bucket_name = "vhs-archive"

    def get_id(self) -> str:
        return "supabase"

    def configure(self, config: Dict[str, Any]) -> bool:
        if not HAS_SUPABASE:
            log.error("[Supabase] Biblioteca 'supabase' não instalada.")
            return False

        url = config.get("SUPABASE_URL")
        key = config.get("SUPABASE_KEY")
        bucket = config.get("SUPABASE_BUCKET", self.bucket_name)

        if not url or not key:
            log.error("[Supabase] Credenciais URL ou KEY ausentes.")
            return False

        try:
            self.client = create_client(url, key)
            self.bucket_name = bucket
            # Checa se o bucket existe, se nao, tenta criar
            buckets = self.client.storage.list_buckets()
            if not any(b.name == bucket for b in buckets):
                self.client.storage.create_bucket(bucket)
            return True
        except Exception as e:
            log.error(f"[Supabase] Falha ao conectar/configurar: {e}")
            return False

    def upload_video(self, local_filepath: str, destination_path: str) -> bool:
        if not self.client:
            return False

        try:
            log.info(
                f"[Supabase] Fazendo upload de {local_filepath} para o bucket {self.bucket_name}..."
            )
            with open(local_filepath, "rb") as f:
                res = self.client.storage.from_(self.bucket_name).upload(
                    file=f,
                    path=destination_path,
                    file_options={"content-type": "video/mp4"},
                )
            log.info("[Supabase] Upload concluído com sucesso.")
            return True
        except Exception as e:
            log.error(f"[Supabase] Falha no upload: {e}")
            return False

    def get_status(self) -> Dict[str, Any]:
        return {"ready": self.client is not None, "bucket": self.bucket_name}
