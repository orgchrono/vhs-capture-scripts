"""Module documentation pending."""

from abc import ABC, abstractmethod
from typing import Dict


class StorageProvider(ABC):
    """Base interface for storage providers (Cloud, NAS, USB, Database)."""

    @abstractmethod
    def get_id(self) -> str:
        """Return unique provider identifier (e.g. 'gdrive', 'local_nas', 'supabase')."""

    @abstractmethod
    def configure(self, config: Dict[str, object]) -> bool:
        """Receive configuration and authenticate/initialize storage backend."""

    @abstractmethod
    def upload_video(self, local_filepath: str, destination_path: str) -> bool:
        """Upload or copy a local video file to the storage destination."""

    @abstractmethod
    def get_status(self) -> Dict[str, object]:
        """Return disk usage, available quota, and connection health status."""
