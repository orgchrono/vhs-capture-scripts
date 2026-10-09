"""Storage router handling cloud and local backend configuration."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from vhs_studio.config.storage_config import load_storage_config, save_storage_config
from vhs_studio.storage.manager import StorageManager
from vhs_studio.api.routers.schemas import StorageConfigPayload

storage_router = APIRouter(prefix="/api/storage", tags=["Storage"])


@storage_router.get("/config")
def get_storage_config():
    """Return cloud and local storage configuration status."""
    data = load_storage_config()
    provider = StorageManager.get_provider(data["provider"])
    status = provider.get_status() if provider else {"ready": False}
    return {
        "provider": data["provider"],
        "config": data["config"],
        "status": status,
        "available_providers": list(StorageManager._providers.keys()),
    }


@storage_router.post("/config")
async def update_storage_config(payload: StorageConfigPayload):
    """Save and validate storage provider configuration."""
    provider_id = payload.provider
    config = payload.config

    provider = StorageManager.get_provider(provider_id)
    if not provider:
        return JSONResponse(status_code=400, content={"error": "Invalid provider."})

    success = provider.configure(config)
    if success:
        save_storage_config(provider_id, config)
        return {"status": "ok", "message": "Configuration saved and validated successfully."}

    return JSONResponse(
        status_code=400, content={"error": "Failed to validate storage configuration."}
    )
