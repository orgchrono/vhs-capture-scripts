from typing import Dict, Any
from .base import StorageProvider
from vhs_studio.core.logger import log
import os

try:
    import boto3
    from botocore.exceptions import ClientError

    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False


class S3Provider(StorageProvider):
    def __init__(self):
        self.s3_client = None
        self.bucket_name = None

    def get_id(self) -> str:
        return "s3_generic"

    def configure(self, config: Dict[str, Any]) -> bool:
        if not HAS_BOTO3:
            log.error("[S3] Biblioteca 'boto3' não instalada.")
            return False

        access_key = config.get("S3_ACCESS_KEY")
        secret_key = config.get("S3_SECRET_KEY")
        endpoint_url = config.get(
            "S3_ENDPOINT_URL"
        )  # Opcional (para Cloudflare R2, MinIO, etc)
        region = config.get("S3_REGION", "us-east-1")
        self.bucket_name = config.get("S3_BUCKET", "vhs-archive")

        if not access_key or not secret_key:
            log.error("[S3] Chaves de acesso ausentes.")
            return False

        try:
            self.s3_client = boto3.client(
                "s3",
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                endpoint_url=endpoint_url if endpoint_url else None,
                region_name=region,
            )
            # Testa acesso ao bucket (head)
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            return True
        except ClientError as e:
            error_code = int(e.response["Error"]["Code"])
            if error_code == 404:
                # Tenta criar o bucket se não existir
                try:
                    self.s3_client.create_bucket(Bucket=self.bucket_name)
                    return True
                except Exception as ce:
                    log.error(f"[S3] Falha ao criar bucket: {ce}")
                    return False
            log.error(f"[S3] Erro de acesso S3: {e}")
            return False
        except Exception as e:
            log.error(f"[S3] Erro de configuração: {e}")
            return False

    def upload_video(self, local_filepath: str, destination_path: str) -> bool:
        if not self.s3_client:
            return False

        try:
            log.info(
                f"[S3] Iniciando upload de {local_filepath} para o bucket {self.bucket_name}..."
            )
            # Extra args para definir ContentType se quiser, ou usar defaults
            self.s3_client.upload_file(
                local_filepath, self.bucket_name, destination_path
            )
            log.info("[S3] Upload concluído com sucesso.")
            return True
        except Exception as e:
            log.error(f"[S3] Erro no upload: {e}")
            return False

    def get_status(self) -> Dict[str, Any]:
        return {"ready": self.s3_client is not None, "bucket": self.bucket_name}
