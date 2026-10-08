from typing import Dict, Optional, Type
from .base import StorageProvider
from vhs_studio.core.logger import log

class StorageManager:
    _providers: Dict[str, Type[StorageProvider]] = {}
    _active_instances: Dict[str, StorageProvider] = {}
    
    @classmethod
    def register_provider(cls, provider_class: Type[StorageProvider]):
        provider_id = provider_class().get_id()
        cls._providers[provider_id] = provider_class
        log.debug(f"[Storage] Provedor registrado: {provider_id}")
        
    @classmethod
    def get_provider(cls, provider_id: str) -> Optional[StorageProvider]:
        if provider_id not in cls._providers:
            return None
            
        if provider_id not in cls._active_instances:
            cls._active_instances[provider_id] = cls._providers[provider_id]()
            
        return cls._active_instances[provider_id]

# Auto-register default providers
from .local import LocalStorageProvider
from .gdrive import GoogleDriveProvider
from .supabase_provider import SupabaseStorageProvider
from .dropbox_provider import DropboxProvider
from .onedrive_provider import OneDriveProvider

StorageManager.register_provider(LocalStorageProvider)
StorageManager.register_provider(GoogleDriveProvider)
StorageManager.register_provider(SupabaseStorageProvider)
StorageManager.register_provider(DropboxProvider)
StorageManager.register_provider(OneDriveProvider)