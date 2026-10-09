"""FastAPI server application factory and router composition orchestrator."""

import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from vhs_studio.core.constants import (
    DEFAULT_API_HOST,
    DEFAULT_API_PORT,
)
from vhs_studio.core.paths import UI_DIST_DIR as DIST_DIR
from vhs_studio.api.process_manager import ProcessManager
from vhs_studio.api.obs_client import OBSClient
from vhs_studio.api.oauth_routes import oauth_router
from vhs_studio.api.routers import (
    system_router,
    storage_router,
    queue_router,
    obs_router,
    restoration_router,
    check_and_launch_obs,
    is_safe_media_path,
    make_origin_verifier,
    SESSION_TOKEN,
)

# Process manager instance orchestrating child CLI operations
pm = ProcessManager()

# Default alias for checking and starting OBS daemon
ensure_obs_running = check_and_launch_obs


def create_app() -> FastAPI:
    """Compose and configure the main FastAPI application instance."""
    app_instance = FastAPI(title="VHS Studio API")

    # Security origin verification middleware
    verify_origin = make_origin_verifier(SESSION_TOKEN)
    app_instance.middleware("http")(verify_origin)

    # Restrict CORS to localhost only
    app_instance.add_middleware(
        CORSMiddleware,
        allow_origins=[
            f"http://{DEFAULT_API_HOST}:{DEFAULT_API_PORT}",
            f"http://localhost:{DEFAULT_API_PORT}",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Modular routers registration
    app_instance.include_router(oauth_router, prefix="/api/oauth")
    app_instance.include_router(system_router)
    app_instance.include_router(storage_router)
    app_instance.include_router(queue_router)
    app_instance.include_router(obs_router)
    app_instance.include_router(restoration_router)

    # Mount frontend static distribution
    if os.path.isdir(DIST_DIR):
        app_instance.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="static")
    else:
        @app_instance.get("/")
        def index():
            """Fallback when UI build artifacts are not yet generated."""
            return {"error": "UI not built. Run 'npm run build' in the ui/ directory."}

    return app_instance


app = create_app()


def run_server(port: int = DEFAULT_API_PORT) -> None:
    """Start uvicorn server instance."""
    import uvicorn

    uvicorn.run(app, host=DEFAULT_API_HOST, port=port, log_level="warning")


__all__ = [
    "app",
    "create_app",
    "run_server",
    "pm",
    "SESSION_TOKEN",
    "ensure_obs_running",
    "OBSClient",
    "is_safe_media_path",
]
