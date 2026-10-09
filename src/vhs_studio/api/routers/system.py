"""System router handling health status, token negotiation, hardware profile and logs."""

import os
import sys
import json
import asyncio
import platform
import subprocess
import urllib.request
from typing import List, Dict
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from vhs_studio.core.constants import (
    OBS_WEBSOCKET_HOST,
    OBS_WEBSOCKET_PORT,
    VALID_MEDIA_EXTENSIONS,
)
from vhs_studio.core.paths import RAW_MEDIA_DIR, get_obs_executable_paths
from vhs_studio.core.filter_builder import FilterBuilder
from vhs_studio.video.vapoursynth_qtgmc import VapourSynthQTGMC
from vhs_studio.core.hardware import get_hardware_profile

system_router = APIRouter(prefix="/api", tags=["System"])


def _resolve_server():
    """Retrieve server module to respect mock isolation in unit tests."""
    import vhs_studio.api.server as server
    return server


def check_and_launch_obs() -> bool:
    """Verify if OBS Studio is running and attempt launching it if offline."""
    try:
        req = urllib.request.Request(
            f"http://{OBS_WEBSOCKET_HOST}:{OBS_WEBSOCKET_PORT}"
        )
        urllib.request.urlopen(req, timeout=1)  # nosec
        return True
    except Exception:
        pass

    import time
    for obs_exe in get_obs_executable_paths():
        if os.path.exists(obs_exe):
            cwd = os.path.dirname(obs_exe) if platform.system() == "Windows" else None
            try:
                subprocess.Popen([obs_exe, "--minimize-to-tray"], cwd=cwd)
                time.sleep(3)
                return True
            except Exception:
                pass
    return False


def _get_raw_media_files() -> List[Dict[str, object]]:
    """Functional pure mapping of raw media directory files."""
    raw_dir = RAW_MEDIA_DIR
    os.makedirs(raw_dir, exist_ok=True)
    files: List[Dict[str, object]] = []
    for f in os.listdir(raw_dir):
        ext = os.path.splitext(f)[1].lower()
        if ext in VALID_MEDIA_EXTENSIONS:
            full_p = os.path.join(raw_dir, f)
            size_mb = os.path.getsize(full_p) / (1024 * 1024)
            files.append({"name": f, "path": full_p, "size_mb": round(size_mb, 1)})
    return files


@system_router.get("/token")
def get_token():
    """Return the active session token."""
    srv = _resolve_server()
    return {"token": srv.SESSION_TOKEN}


@system_router.get("/status")
def get_status():
    """Return comprehensive system, encoder, file and process health status."""
    srv = _resolve_server()
    encoder = FilterBuilder.detect_best_encoder()
    vs_ok = VapourSynthQTGMC.is_available()
    obs_ok = srv.ensure_obs_running()

    from vhs_studio.core.logger import log

    internal_logs: List[str] = []
    for h in log.handlers:
        if type(h).__name__ == "MemoryLogHandler":
            internal_logs = h.get_logs()
            break

    combined_logs = internal_logs + srv.pm.get_logs()

    return {
        "encoder": encoder,
        "vapoursynth_available": vs_ok,
        "obs_connected": obs_ok,
        "raw_files": _get_raw_media_files(),
        "process_running": srv.pm.is_running(),
        "process_logs": combined_logs,
        "hardware": get_hardware_profile(),
    }


@system_router.get("/hardware")
def get_hardware():
    """Return hardware diagnostics, tier rating and honest performance benchmarks."""
    return get_hardware_profile()


@system_router.get("/logs")
def get_all_logs():
    """Return historical log buffer for frontend RTK Query."""
    srv = _resolve_server()
    return {"active": srv.pm.is_running(), "logs": srv.pm.get_logs()}


@system_router.get("/logs/stream")
async def stream_logs(request: Request):
    """Server-Sent Events (SSE) endpoint for low-latency real-time log streaming."""
    srv = _resolve_server()

    async def event_generator():
        yield f"data: {json.dumps({'connected': True, 'active': srv.pm.is_running()})}\n\n"
        last_idx = 0
        idle_ticks = 0
        while True:
            if await request.is_disconnected():
                break
            logs = srv.pm.get_logs()
            if len(logs) > last_idx:
                for line in logs[last_idx:]:
                    payload = json.dumps({"line": line, "active": srv.pm.is_running()})
                    yield f"data: {payload}\n\n"
                last_idx = len(logs)
                idle_ticks = 0
            elif not srv.pm.is_running():
                idle_ticks += 1
                if idle_ticks >= 2:
                    yield f"data: {json.dumps({'active': False})}\n\n"
                    break
            await asyncio.sleep(0.2)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
