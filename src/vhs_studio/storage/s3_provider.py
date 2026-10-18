"""Module documentation pending."""

from typing import Dict
from .base import StorageProvider
from vhs_studio.core.logger import log

try:
    import boto3
    from botocore.exceptions import ClientError

    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False


class S3Provider(StorageProvider):
    """Documentation for S3Provider."""

    def __init__(self):
        """Documentation for __init__."""
        self.s3_client = None
        self.bucket_name = None

    def get_id(self) -> str:
        """Documentation for get_id."""
        return "s3_generic"

    def configure(self, config: Dict[str, object]) -> bool:
        """Documentation for configure."""
        if not HAS_BOTO3:
            log.error("[S3] Library 'boto3' is not installed.")
            return False

        access_key = config.get("S3_ACCESS_KEY")
        secret_key = config.get("S3_SECRET_KEY")
        endpoint_url = config.get(
            "S3_ENDPOINT_URL"
        )  # Optional (for Cloudflare R2, MinIO, etc.)
        region = config.get("S3_REGION", "us-east-1")
        self.bucket_name = config.get("S3_BUCKET", "vhs-archive")

        if not access_key or not secret_key:
            log.error("[S3] Missing access credentials.")
            return False

        try:
            self.s3_client = boto3.client(
                "s3",
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                endpoint_url=endpoint_url if endpoint_url else None,
                region_name=region,
            )
            # Test bucket access (head)
            self.s3_client.head_bucket(Bucket=self.bucket_name)
            return True
        except ClientError as e:
            error_code = str(e.response.get("Error", {}).get("Code", ""))
            if error_code in ("404", "NoSuchBucket"):
                # Attempt to create the bucket if it does not exist
                try:
                    if self.s3_client is not None:
                        self.s3_client.create_bucket(Bucket=self.bucket_name)
                        return True
                    return False
                except Exception as ce:
                    log.error(f"[S3] Failed to create bucket: {ce}")
                    return False
            log.error(f"[S3] S3 access error: {e}")
            return False
        except Exception as e:
            log.error(f"[S3] Configuration error: {e}")
            return False

    def upload_video(self, local_filepath: str, destination_path: str) -> bool:
        """Upload video file to S3 bucket."""
        if not self.s3_client:
            return False

        try:
            log.info(
                f"[S3] Starting upload of {local_filepath} to bucket {self.bucket_name}..."
            )
            self.s3_client.upload_file(
                local_filepath, self.bucket_name, destination_path
            )
            log.info("[S3] Upload completed successfully.")
            return True
        except Exception as e:
            log.error(f"[S3] Upload error: {e}")
            return False

    def get_status(self) -> Dict[str, object]:
        """Documentation for get_status."""
        return {"ready": self.s3_client is not None, "bucket": self.bucket_name}
