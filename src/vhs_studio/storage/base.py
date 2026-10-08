from abc import ABC, abstractmethod
from typing import Optional, Dict, Any


class StorageProvider(ABC):
    """Interface base para provedores de armazenamento (Nuvem, NAS, USB, Banco de Dados)."""

    @abstractmethod
    def get_id(self) -> str:
        """Retorna o identificador único do provedor (ex: 'gdrive', 'local_nas', 'supabase')"""
        pass

    @abstractmethod
    def configure(self, config: Dict[str, Any]) -> bool:
        """Recebe configurações e autentica/prepara o storage."""
        pass

    @abstractmethod
    def upload_video(self, local_filepath: str, destination_path: str) -> bool:
        """Faz o upload/cópia de um vídeo para o destino."""
        pass

    @abstractmethod
    def get_status(self) -> Dict[str, Any]:
        """Retorna uso de disco, cota disponível, saúde da conexão."""
        pass
