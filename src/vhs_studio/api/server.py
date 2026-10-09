"""FastAPI server for desktop and frontend communication."""

# flake8: noqa
import json
import os
import sys
import subprocess
import secrets
import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from vhs_studio.core.constants import (
    DEFAULT_API_HOST,
    DEFAULT_API_PORT,
    OBS_WEBSOCKET_HOST,
    OBS_WEBSOCKET_PORT,
    VALID_MEDIA_EXTENSIONS,
)
from vhs_studio.core.paths import RAW_MEDIA_DIR, UI_DIST_DIR as DIST_DIR
from vhs_studio.core.filter_builder import FilterBuilder
from vhs_studio.video.vapoursynth_qtgmc import VapourSynthQTGMC
from vhs_studio.api.process_manager import ProcessManager
from vhs_studio.api.obs_client import OBSClient
from vhs_studio.api.oauth_routes import oauth_router
from vhs_studio.config.storage_config import load_storage_config, save_storage_config
from vhs_studio.storage.manager import StorageManager
from vhs_studio.core.queue_manager import queue_manager, queue_worker
from vhs_studio.core.hardware import get_hardware_profile

# Session token for minimal CSRF mitigation when accessed via web view
SESSION_TOKEN = secrets.token_hex(16)
pm = ProcessManager()

app = FastAPI(title="VHS Studio API")
app.include_router(oauth_router, prefix="/api/oauth")

# Restrict CORS to localhost only
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        f"http://{DEFAULT_API_HOST}:{DEFAULT_API_PORT}",
        f"http://localhost:{DEFAULT_API_PORT}",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def verify_origin(request: Request, call_next):
    """Protect API endpoints against unauthorized external requests."""
    if request.url.path.startswith("/api/"):
        host = request.headers.get("host", "")
        if (
            not host.startswith("127.0.0.1")
            and not host.startswith("localhost")
            and not host.startswith("testserver")
        ):
            return JSONResponse(status_code=403, content={"error": "Access denied."})

        if request.method == "POST":
            origin = request.headers.get("origin")
            if origin and not (
                origin.startswith(f"http://{DEFAULT_API_HOST}")
                or origin.startswith("http://localhost")
                or origin.startswith("http://testserver")
            ):
                return JSONResponse(
                    status_code=403, content={"error": "Invalid origin."}
                )

        token = request.headers.get("X-Session-Token")
        if token and token != SESSION_TOKEN:
            return JSONResponse(
                status_code=403, content={"error": "Invalid session token."}
            )

    response = await call_next(request)
    return response


@app.get("/api/token")
def get_token():
    """Return the active session token."""
    return {"token": SESSION_TOKEN}


def ensure_obs_running():
    """Verify if OBS Studio is running and attempt launching it if offline."""
    import urllib.request

    try:
        req = urllib.request.Request(
            f"http://{OBS_WEBSOCKET_HOST}:{OBS_WEBSOCKET_PORT}"
        )
        urllib.request.urlopen(req, timeout=1)  # nosec
        return True
    except Exception:
        pass

    from vhs_studio.core.paths import get_obs_executable_paths
    import time
    import platform

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


@app.get("/api/status")
def get_status():
    """Return comprehensive system, encoder, file and process health status."""
    encoder = FilterBuilder.detect_best_encoder()
    vs_ok = VapourSynthQTGMC.is_available()

    raw_dir = RAW_MEDIA_DIR
    os.makedirs(raw_dir, exist_ok=True)

    raw_files = []
    for f in os.listdir(raw_dir):
        ext = os.path.splitext(f)[1].lower()
        if ext in VALID_MEDIA_EXTENSIONS:
            full_p = os.path.join(raw_dir, f)
            size_mb = os.path.getsize(full_p) / (1024 * 1024)
            raw_files.append({"name": f, "path": full_p, "size_mb": round(size_mb, 1)})

    # Fetch memory logs for UI streaming
    from vhs_studio.core.logger import log

    internal_logs = []
    for h in log.handlers:
        if type(h).__name__ == "MemoryLogHandler":
            internal_logs = h.get_logs()
            break

    combined_logs = internal_logs + pm.get_logs()

    return {
        "encoder": encoder,
        "vapoursynth_available": vs_ok,
        "obs_connected": ensure_obs_running(),
        "raw_files": raw_files,
        "process_running": pm.is_running(),
        "process_logs": combined_logs,
        "hardware": get_hardware_profile(),
    }


@app.get("/api/hardware")
def get_hardware():
    """Return hardware diagnostics, tier rating and honest performance benchmarks."""
    return get_hardware_profile()


@app.get("/api/logs/stream")
async def stream_logs(request: Request):
    """Server-Sent Events (SSE) endpoint for low-latency real-time log streaming."""

    async def event_generator():
        yield f"data: {json.dumps({'connected': True, 'active': pm.is_running()})}\n\n"
        last_idx = 0
        idle_ticks = 0
        while True:
            if await request.is_disconnected():
                break
            logs = pm.get_logs()
            if len(logs) > last_idx:
                for line in logs[last_idx:]:
                    payload = json.dumps({"line": line, "active": pm.is_running()})
                    yield f"data: {payload}\n\n"
                last_idx = len(logs)
                idle_ticks = 0
            elif not pm.is_running():
                idle_ticks += 1
                if idle_ticks >= 2:
                    yield f"data: {json.dumps({'active': False})}\n\n"
                    break
            await asyncio.sleep(0.2)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/obs/stats")
def get_obs_stats():
    """Return live telemetry from OBS Studio WebSocket API (bitrate, duration, fps, cpu)."""
    obs = OBSClient()
    if not obs.is_connected:
        obs.connect(max_retries=1, silent=True)
    if obs.is_connected:
        status = obs.send_request("GetRecordStatus") or {}
        stats = obs.send_request("GetStats") or {}
        return {
            "connected": True,
            "recording": status.get("outputActive", False),
            "timecode": status.get("outputTimecode", "00:00:00"),
            "duration_sec": round(status.get("outputDuration", 0) / 1000.0, 1),
            "bytes": status.get("outputBytes", 0),
            "bitrate_kbps": round(stats.get("outputBitrate", 0), 1),
            "fps": round(stats.get("activeFps", 0), 1),
            "cpu_usage": round(stats.get("cpuUsage", 0), 1),
            "memory_mb": round(stats.get("memoryUsage", 0), 1),
        }
    return {"connected": False, "recording": False}


@app.get("/api/storage/config")
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


@app.post("/api/storage/config")
async def update_storage_config(request: Request):
    """Save and validate storage provider configuration."""
    data = await request.json()
    provider_id = data.get("provider")
    config = data.get("config", {})

    provider = StorageManager.get_provider(provider_id)
    if not provider:
        return JSONResponse(status_code=400, content={"error": "Invalid provider."})

    success = provider.configure(config)
    if success:
        save_storage_config(provider_id, config)
        return {"status": "ok", "message": "Configuration saved and validated successfully."}
    else:
        return JSONResponse(
            status_code=400, content={"error": "Failed to validate storage configuration."}
        )


@app.get("/api/queue")
def get_queue():
    """Return queued jobs and status statistics."""
    return {
        "jobs": queue_manager.list_jobs(),
        "stats": queue_manager.get_stats(),
        "worker_running": queue_worker._running,
    }


@app.post("/api/queue/enqueue")
async def enqueue_queue_job(request: Request):
    """Enqueue a job into the persistent batch processing queue."""
    data = await request.json()
    raw_path = data.get("input")
    params = data.get("params", {})
    priority = data.get("priority", 0)

    if not raw_path or "media" not in raw_path:
        return JSONResponse(
            status_code=400, content={"error": "Invalid or insecure file path."}
        )

    job_id = queue_manager.enqueue(raw_path, params, priority)
    return {"status": "ok", "job_id": job_id, "message": f"Job #{job_id} enqueued."}


@app.post("/api/queue/cancel/{job_id}")
def cancel_queue_job(job_id: int):
    """Cancel a pending job in the queue."""
    if queue_manager.cancel_job(job_id):
        return {"status": "ok", "message": f"Job #{job_id} cancelled."}
    return JSONResponse(status_code=400, content={"error": "Job could not be cancelled."})


@app.post("/api/queue/start")
def start_queue_worker():
    """Start the background sequential batch worker."""
    queue_worker.start()
    return {"status": "ok", "message": "Queue worker started."}


@app.post("/api/queue/stop")
def stop_queue_worker():
    """Pause the background sequential batch worker."""
    queue_worker.stop()
    return {"status": "ok", "message": "Queue worker stopped."}


@app.post("/api/action")
async def perform_action(request: Request):
    """Execute asynchronous studio actions triggered from the frontend."""
    data = await request.json()
    action = data.get("action")
    params = data.get("params", {})

    if action == "start_restore":
        if pm.is_running():
            return {
                "status": "error",
                "message": "A process is already running.",
            }

        # Auto-install QTGMC dependencies if missing
        if params.get("deinterlacer") and "qtgmc" in params.get("deinterlacer"):
            if not VapourSynthQTGMC.is_available():
                cmd = [sys.executable, "-m", "vhs_studio.cli.setup_qtgmc"]
                pm.start_process(cmd)
                return {
                    "status": "started",
                    "message": "QTGMC dependencies are being installed in the background.",
                }

        input_file = params.get("input")
        if not input_file or "media" not in input_file:
            return {
                "status": "error",
                "message": "Invalid or insecure file path.",
            }

        params_json = json.dumps(params)
        cmd = [
            sys.executable,
            "-m",
            "vhs_studio",
            "pipeline",
            input_file,
            "--params-json",
            params_json,
        ]

        success, msg = pm.start_process(cmd)
        if success:
            return {"status": "ok", "message": "Restoration pipeline started."}
        else:
            return {"status": "error", "message": msg}

    elif action == "install_obs":
        if pm.is_running():
            return {"status": "error", "message": "Please wait for the current process to finish."}

        cmd = [sys.executable, "-m", "vhs_studio.cli.setup_obs"]
        success, msg = pm.start_process(cmd)

        if success:
            return {"status": "started", "message": "OBS installer launched."}
        else:
            return {"status": "error", "message": msg}

    elif action == "install_vapoursynth":
        if pm.is_running():
            return {"status": "error", "message": "Please wait for the current process to finish."}

        cmd = [sys.executable, "-m", "vhs_studio.cli.setup_qtgmc"]

        success, msg = pm.start_process(cmd)
        if success:
            return {"status": "ok", "message": "VapourSynth installation started."}
        else:
            return {"status": "error", "message": msg}

    elif action == "generate_subtitles":
        if pm.is_running():
            return {"status": "error", "message": "Please wait for the current process to finish."}

        input_file = params.get("input")
        model_size = params.get("model_size", "tiny")

        cmd = [
            sys.executable,
            "-c",
            f"from vhs_studio.ai.whisper_engine import transcribe_and_generate_vtt; transcribe_and_generate_vtt(r'{input_file}', '{model_size}')",
        ]

        success, msg = pm.start_process(cmd)
        if success:
            return {"status": "ok", "message": "Subtitle generation started."}
        else:
            return {"status": "error", "message": msg}

    elif action == "stop_process":
        if pm.terminate():
            return {"status": "ok", "message": "Process terminated via API."}
        return {"status": "error", "message": "No process currently running."}

    return {"status": "error", "message": "Unknown action."}


@app.get("/api/logs")
def get_all_logs():
    """Return historical log buffer for frontend RTK Query."""
    return {"active": pm.is_running(), "logs": pm.get_logs()}


@app.post("/api/run")
async def run_pipeline(request: Request):
    """Run direct restoration pipeline endpoint for frontend integration."""
    params = await request.json()
    if pm.is_running():
        return JSONResponse(status_code=400, content={"status": "error", "message": "A process is already running."})

    input_file = params.get("input")
    if not input_file or "media" not in input_file:
        return JSONResponse(status_code=400, content={"status": "error", "message": "Invalid or insecure file path."})

    params_json = json.dumps(params)
    cmd = [
        sys.executable,
        "-m",
        "vhs_studio",
        "pipeline",
        input_file,
        "--params-json",
        params_json,
    ]
    success, msg = pm.start_process(cmd)
    if success:
        return {"status": "ok", "message": "Restoration pipeline started."}
    return JSONResponse(status_code=500, content={"status": "error", "message": msg})


@app.post("/api/obs/start")
def obs_start():
    """Trigger OBS Studio recording start."""
    obs = OBSClient()
    if not obs.is_connected:
        obs.connect()
    res = obs.start_record()
    if res and res.get("requestStatus", {}).get("result"):
        return {"status": "ok", "message": "Recording started."}
    return {"status": "error", "message": "Failed to start OBS recording."}


@app.post("/api/obs/stop")
def obs_stop():
    """Trigger OBS Studio recording stop."""
    obs = OBSClient()
    if not obs.is_connected:
        obs.connect()
    res = obs.stop_record() or {}
    output_path = res.get("responseData", {}).get("outputPath", "")
    return {"status": "ok", "message": "Recording stopped.", "path": output_path}


@app.post("/api/obs/virtualcam")
async def obs_virtualcam(request: Request):
    """Toggle OBS Virtual Camera output."""
    body = await request.json()
    enable = body.get("enable", True)
    obs = OBSClient()
    if not obs.is_connected:
        obs.connect()
    action = "StartVirtualCam" if enable else "StopVirtualCam"
    obs.send_request(action)
    return {"status": "ok", "message": f"Virtual camera set to {enable}."}


@app.post("/api/install_qtgmc")
def install_qtgmc():
    """Launch background installer for VapourSynth and QTGMC."""
    if pm.is_running():
        return {"status": "error", "message": "A process is already running."}
    cmd = [sys.executable, "-m", "vhs_studio.cli.setup_qtgmc"]
    success, msg = pm.start_process(cmd)
    if success:
        return {"status": "started", "message": "VapourSynth installation started."}
    return {"status": "error", "message": msg}


# Mount frontend distribution
if os.path.isdir(DIST_DIR):
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="static")
else:

    @app.get("/")
    def index():
        """Fallback when UI build artifacts are not yet generated."""
        return {"error": "UI not built. Run 'npm run build' in the ui/ directory."}


def run_server(port=DEFAULT_API_PORT):
    """Start uvicorn server instance."""
    import uvicorn

    uvicorn.run(app, host=DEFAULT_API_HOST, port=port, log_level="warning")
