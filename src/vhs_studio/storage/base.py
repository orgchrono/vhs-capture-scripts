from abc import ABC, abstractmethod
from typing import Dict


class StorageProvider(ABC):
    """Interface base para provedores de armazenamento (Nuvem, NAS, USB, Banco de Dados)."""

    @abstractmethod
    def get_id(self) -> str:
        """Retorna o identificador único do provedor (ex: 'gdrive', 'local_nas', 'supabase')"""

    @abstractmethod
    def configure(self, config: Dict[str, object]) -> bool:
        """Recebe configurações e autentica/prepara o storage."""

    @abstractmethod
    def upload_video(self, local_filepath: str, destination_path: str) -> bool:
        """Faz o upload/cópia de um vídeo para o destino."""

    @abstractmethod
    def get_status(self) -> Dict[str, object]:
        """Retorna uso de disco, cota disponível, saúde da conexão."""
