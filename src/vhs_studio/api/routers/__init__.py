"""Router package aggregating modular endpoints for VHS Studio API."""

from vhs_studio.api.routers.system import system_router, check_and_launch_obs
from vhs_studio.api.routers.storage import storage_router
from vhs_studio.api.routers.queue import queue_router
from vhs_studio.api.routers.obs import obs_router
from vhs_studio.api.routers.restoration import restoration_router
from vhs_studio.api.routers.ingest import ingest_router
from vhs_studio.api.routers.security import (
    SESSION_TOKEN,
    is_safe_media_path,
    is_safe_ingest_path,
    make_origin_verifier,
)

__all__ = [
    "system_router",
    "storage_router",
    "queue_router",
    "obs_router",
    "restoration_router",
    "ingest_router",
    "check_and_launch_obs",
    "is_safe_media_path",
    "is_safe_ingest_path",
    "make_origin_verifier",
    "SESSION_TOKEN",
]
