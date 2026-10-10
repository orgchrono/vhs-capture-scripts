"""System router handling health status, token negotiation, hardware profile and logs."""

import os
import sys
import json
import asyncio
import platform
import subprocess
import socket
import threading
from typing import List, Dict, Callable
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from vhs_studio.core.constants import (
    OBS_WEBSOCKET_HOST,
    OBS_WEBSOCKET_PORT,
    VALID_MEDIA_EXTENSIONS,
    DEFAULT_SOCKET_TIMEOUT_SEC,
    DEFAULT_PROCESS_CHECK_TIMEOUT_SEC,
    DEFAULT_SSE_POLL_INTERVAL_SEC,
)
from vhs_studio.core.paths import RAW_MEDIA_DIR, get_obs_executable_paths
from vhs_studio.core.filter_builder import FilterBuilder
from vhs_studio.video.vapoursynth_qtgmc import VapourSynthQTGMC
from vhs_studio.core.hardware import get_hardware_profile
from vhs_studio.core.logger import log

system_router = APIRouter(prefix="/api", tags=["System"])


def _resolve_server():
    """Retrieve server module to respect mock isolation in unit tests."""
    import vhs_studio.api.server as server
    return server


def is_obs_process_active() -> bool:
    """Check if an OBS Studio process is already active in the operating system."""
    sys_name = platform.system()
    try:
        if sys_name == "Windows":
            r = subprocess.run(
                ["tasklist", "/fi", "imagename eq obs64.exe", "/fo", "csv", "/nh"],
                capture_output=True,
                text=True,
                errors="replace",
                timeout=DEFAULT_PROCESS_CHECK_TIMEOUT_SEC,
            )
            if "obs64.exe" in r.stdout.lower():
                log.debug("[HAL] Active obs64.exe detected in tasklist.")
                return True
            r32 = subprocess.run(
                ["tasklist", "/fi", "imagename eq obs32.exe", "/fo", "csv", "/nh"],
                capture_output=True,
                text=True,
                errors="replace",
                timeout=DEFAULT_PROCESS_CHECK_TIMEOUT_SEC,
            )
            is_active = "obs32.exe" in r32.stdout.lower()
            if is_active:
                log.debug("[HAL] Active obs32.exe detected in tasklist.")
            return is_active
        else:
            r = subprocess.run(
                ["pgrep", "-x", "obs"],
                capture_output=True,
                text=True,
                errors="replace",
                timeout=DEFAULT_PROCESS_CHECK_TIMEOUT_SEC,
            )
            return r.returncode == 0
    except Exception as e:
        log.debug(f"[HAL] Exception while verifying OBS process: {e}")
        return False


def is_obs_websocket_port_open(
    host: str = OBS_WEBSOCKET_HOST, port: int = OBS_WEBSOCKET_PORT
) -> bool:
    """Check if OBS WebSocket TCP port is actively accepting connections."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(DEFAULT_SOCKET_TIMEOUT_SEC)
            is_open = sock.connect_ex((host, port)) == 0
            if is_open:
                log.debug(f"[HAL] OBS WebSocket port {port} is active on {host}.")
            return is_open
    except Exception as e:
        log.debug(f"[HAL] Exception checking OBS port: {e}")
        return False


def make_obs_launcher() -> Callable[[], bool]:
    """Closure providing controlled OBS detection and single-shot safe launcher without duplicate instances."""
    has_attempted_launch: List[bool] = [False]
    lock = threading.Lock()

    def check_and_launch() -> bool:
        # 1. Se a porta TCP do WebSocket do OBS já está respondendo, a instância existente está ativa!
        if is_obs_websocket_port_open():
            return True

        # 2. Se o processo do OBS já está em execução no sistema operacional:
        # NUNCA iniciar novo processo para evitar conflitos, pop-ups de duplicidade e Safe Mode!
        if is_obs_process_active():
            return True

        # 3. Se nem a porta nem o processo estão ativos, podemos tentar lançar uma única vez
        with lock:
            if has_attempted_launch[0]:
                return False
            has_attempted_launch[0] = True

            for obs_exe in get_obs_executable_paths():
                if os.path.exists(obs_exe):
                    cwd = (
                        os.path.dirname(obs_exe)
                        if platform.system() == "Windows"
                        else None
                    )
                    try:
                        subprocess.Popen([obs_exe, "--minimize-to-tray"], cwd=cwd)
                        return True
                    except Exception:
                        pass
        return False

    return check_and_launch


check_and_launch_obs = make_obs_launcher()


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
            files.append({
                "name": f,
                "path": full_p,
                "size_mb": round(size_mb, 1),
                "thumbnail_url": f"/api/media/thumbnail?path={full_p}",
            })
    return files


@system_router.get("/media/thumbnail")
def get_media_thumbnail(path: str):
    """Serve or generate on-the-fly representative thumbnail for raw video."""
    from fastapi.responses import FileResponse, Response
    from vhs_studio.api.routers.security import is_safe_media_path
    from vhs_studio.media.thumbnail import generate_smart_thumbnail

    if not is_safe_media_path(path) or not os.path.exists(path):
        return Response(status_code=404)

    thumb_path = generate_smart_thumbnail(path)
    if thumb_path and os.path.exists(thumb_path):
        return FileResponse(thumb_path, media_type="image/jpeg")
    return Response(status_code=404)


@system_router.get("/token")
def get_token():
    """Return the active session token."""
    srv = _resolve_server()
    return {"token": srv.SESSION_TOKEN}


@system_router.get("/status")
def get_status() -> Dict[str, object]:
    """Return comprehensive system, encoder, file and process health status."""
    srv = _resolve_server()
    encoder = FilterBuilder.detect_best_encoder()
    vs_ok = VapourSynthQTGMC.is_available()
    obs_ok = srv.ensure_obs_running()

    from vhs_studio.core.logger import log

    internal_logs: List[str] = []
    for h in log.handlers:
        if type(h).__name__ == "MemoryLogHandler" and hasattr(h, "get_logs"):
            internal_logs = getattr(h, "get_logs")()
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
    is_running = srv.pm.is_running()
    return {
        "active": is_running,
        "logs": srv.pm.get_logs(),
        "exit_code": srv.pm.last_exit_code,
        "success": srv.pm.last_success,
    }


@system_router.get("/logs/stream")
async def stream_logs(request: Request):
    """Server-Sent Events (SSE) endpoint for low-latency real-time log streaming."""
    srv = _resolve_server()

    async def event_generator():
        conn_payload = json.dumps({"connected": True, "active": srv.pm.is_running()})
        yield f"data: {conn_payload}\n\n"
        last_idx = 0
        idle_ticks = 0
        while True:
            if await request.is_disconnected():
                break
            logs = srv.pm.get_logs()
            is_running = srv.pm.is_running()
            if len(logs) > last_idx:
                for line in logs[last_idx:]:
                    payload = json.dumps({
                        "line": line,
                        "active": is_running,
                        "exit_code": srv.pm.last_exit_code,
                        "success": srv.pm.last_success,
                    })
                    yield f"data: {payload}\n\n"
                last_idx = len(logs)
                idle_ticks = 0
            elif not is_running:
                idle_ticks += 1
                if idle_ticks >= 2:
                    end_payload = json.dumps({
                        "active": False,
                        "exit_code": srv.pm.last_exit_code,
                        "success": srv.pm.last_success,
                    })
                    yield f"data: {end_payload}\n\n"
                    break
            await asyncio.sleep(0.2)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@system_router.get("/ingest/panasonic/disks")
def get_panasonic_disks() -> Dict[str, object]:
    """Scan and return physical drives and optical media detected on the host system."""
    from vhs_studio.ingest.panasonic_dvr import detect_connected_disks
    disks = detect_connected_disks()
    return {"disks": disks, "total": len(disks)}
