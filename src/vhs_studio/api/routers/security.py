"""Security utilities, path validation, and origin verification middleware."""

import os
import secrets
from typing import Callable, Coroutine
from fastapi import Request
from fastapi.responses import JSONResponse

from vhs_studio.core.constants import (
    DEFAULT_API_HOST,
    DEFAULT_API_PORT,
    VALID_MEDIA_EXTENSIONS,
    VALID_INGEST_EXTENSIONS,
)
from vhs_studio.core.paths import MEDIA_DIR, RAW_MEDIA_DIR

# Ephemeral session token for minimal CSRF mitigation when accessed via web view
SESSION_TOKEN = secrets.token_hex(16)


def is_safe_media_path(raw_path: str | None) -> bool:
    """Validate that raw_path is safe against traversal and stays within MEDIA_DIR,
    points to a valid file in RAW_MEDIA_DIR, or is an existing media file on disk.

    Pure function without side effects.
    """
    if not raw_path or not isinstance(raw_path, str):
        return False
    if "\0" in raw_path or ".." in raw_path:
        return False
    norm = os.path.normpath(raw_path).replace("\\", "/")
    if norm.startswith("media/") or norm == "media":
        return True

    # Plain filename check (e.g. dropped files like 'tape.mkv')
    base = os.path.basename(raw_path)
    if base == raw_path.strip():
        if os.path.exists(os.path.join(RAW_MEDIA_DIR, base)) or os.path.exists(
            os.path.join(MEDIA_DIR, base)
        ):
            return True

    try:
        abs_p = os.path.abspath(raw_path)
        media_abs = os.path.abspath(MEDIA_DIR)
        common = os.path.commonpath([abs_p, media_abs])
        if common == media_abs:
            return True
    except Exception:
        pass

    # Safe existing media file on disk with valid media extension
    try:
        if os.path.isabs(raw_path) and os.path.isfile(raw_path):
            ext = os.path.splitext(raw_path)[1].lower()
            if ext in VALID_MEDIA_EXTENSIONS:
                return True
    except Exception:
        pass

    return False


def is_safe_ingest_path(raw_path: str | None) -> bool:
    """Validate that raw_path is safe against traversal and is a valid disk image/media source."""
    if is_safe_media_path(raw_path):
        return True
    if not raw_path or not isinstance(raw_path, str):
        return False
    if "\0" in raw_path or ".." in raw_path:
        return False

    try:
        if os.path.isabs(raw_path) and os.path.isfile(raw_path):
            ext = os.path.splitext(raw_path)[1].lower()
            if ext in VALID_INGEST_EXTENSIONS:
                return True
    except Exception:
        pass

    return False


def make_origin_verifier(session_token: str) -> Callable[[Request, Callable[[Request], Coroutine[object, object, JSONResponse]]], Coroutine[object, object, JSONResponse]]:
    """Closure factory returning an HTTP middleware that enforces origin checks."""
    allowed_host_prefixes = ("127.0.0.1", "localhost", "testserver")
    allowed_origins = (
        f"http://{DEFAULT_API_HOST}:{DEFAULT_API_PORT}",
        f"http://localhost:{DEFAULT_API_PORT}",
        f"http://{DEFAULT_API_HOST}",
        "http://localhost",
        "http://testserver",
    )

    async def verify_origin_middleware(request: Request, call_next):
        if request.url.path.startswith("/api/"):
            host = request.headers.get("host", "")
            if not any(host.startswith(prefix) for prefix in allowed_host_prefixes):
                return JSONResponse(status_code=403, content={"error": "Access denied."})

            if request.method == "POST":
                origin = request.headers.get("origin")
                if origin and not any(origin.startswith(allowed) for allowed in allowed_origins):
                    return JSONResponse(status_code=403, content={"error": "Invalid origin."})

            token = request.headers.get("X-Session-Token")
            if token and token != session_token:
                return JSONResponse(status_code=403, content={"error": "Invalid session token."})

        return await call_next(request)

    return verify_origin_middleware
