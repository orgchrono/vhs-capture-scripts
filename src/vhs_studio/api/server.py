# flake8: noqa
import json
import os
import sys
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import secrets

from vhs_studio.core.filter_builder import FilterBuilder
from vhs_studio.video.vapoursynth_qtgmc import VapourSynthQTGMC
from vhs_studio.api.process_manager import ProcessManager

# Session token for minimal security against CSRF if accessed via browser
SESSION_TOKEN = secrets.token_hex(16)
pm = ProcessManager()

app = FastAPI(title="VHS Studio API")

from vhs_studio.api.oauth_routes import oauth_router

app.include_router(oauth_router, prefix="/api/oauth")


# Setup CORS to only allow localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8088", "http://localhost:8088"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import sys


from vhs_studio.core.paths import RAW_MEDIA_DIR, UI_DIST_DIR as DIST_DIR


@app.middleware("http")
async def verify_origin(request: Request, call_next):
    # Protect API routes
    if request.url.path.startswith("/api/"):
        host = request.headers.get("host", "")
        if not host.startswith("127.0.0.1") and not host.startswith("localhost"):
            return JSONResponse(status_code=403, content={"error": "Acesso negado."})

        if request.method == "POST":
            origin = request.headers.get("origin")
            if origin and not (
                origin.startswith("http://127.0.0.1")
                or origin.startswith("http://localhost")
            ):
                return JSONResponse(
                    status_code=403, content={"error": "Origem inv??lida."}
                )

        token = request.headers.get("X-Session-Token")
        if token and token != SESSION_TOKEN:
            return JSONResponse(
                status_code=403, content={"error": "Token de sess??o inv??lido."}
            )

    response = await call_next(request)
    return response


@app.get("/api/token")
def get_token():
    return {"token": SESSION_TOKEN}


@app.get("/api/status")
def ensure_obs_running():
    import urllib.request

    try:
        # Check if websocket responds
        req = urllib.request.Request("http://127.0.0.1:4455")
        urllib.request.urlopen(req, timeout=1)
        return True
    except:
        pass  # Not responding

    # Try to launch OBS (Portable or System)
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
            except:
                pass
    return False


@app.get("/api/status")
def get_status():
    encoder = FilterBuilder.detect_best_encoder()
    vs_ok = VapourSynthQTGMC.is_available()

    raw_dir = RAW_MEDIA_DIR
    os.makedirs(raw_dir, exist_ok=True)

    valid_exts = {".mkv", ".mp4", ".mov", ".avi", ".ts", ".m2ts"}
    raw_files = []
    for f in os.listdir(raw_dir):
        ext = os.path.splitext(f)[1].lower()
        if ext in valid_exts:
            full_p = os.path.join(raw_dir, f)
            size_mb = os.path.getsize(full_p) / (1024 * 1024)
            raw_files.append({"name": f, "path": full_p, "size_mb": round(size_mb, 1)})

    # Puxar logs internos da UI
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
    }


from vhs_studio.config.storage_config import load_storage_config, save_storage_config
from vhs_studio.storage.manager import StorageManager


@app.get("/api/storage/config")
def get_storage_config():
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
    data = await request.json()
    provider_id = data.get("provider")
    config = data.get("config", {})

    provider = StorageManager.get_provider(provider_id)
    if not provider:
        return JSONResponse(status_code=400, content={"error": "Provedor invalido"})

    success = provider.configure(config)
    if success:
        save_storage_config(provider_id, config)
        return {"status": "ok", "message": "Configuracao salva e validada!"}
    else:
        return JSONResponse(
            status_code=400, content={"error": "Falha ao validar configuracao."}
        )


@app.post("/api/action")
async def perform_action(request: Request):
    data = await request.json()
    action = data.get("action")
    params = data.get("params", {})

    if action == "start_restore":
        if pm.is_running():
            return {
                "status": "error",
                "message": "J???? existe um processo em andamento.",
            }

        # Pipeline Auto-Install
        if params.get("deinterlacer") and "qtgmc" in params.get("deinterlacer"):
            from vhs_studio.video.vapoursynth_qtgmc import VapourSynthQTGMC

            if not VapourSynthQTGMC.is_available():
                cmd = [sys.executable, "-m", "vhs_studio.cli.setup_qtgmc"]
                pm.start_process(cmd)
                return {
                    "status": "started",
                    "message": "Depend????ncias do QTGMC est????o sendo instaladas. A restaura????????o iniciar???? ap????s a conclus????o autom????tica (veja o log).",
                }

            return {
                "status": "error",
                "message": "J?? existe um processo em andamento.",
            }

        input_file = params.get("input")
        if not input_file or "media" not in input_file:
            return {
                "status": "error",
                "message": "Caminho de arquivo inv??lido ou inseguro.",
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
            return {"status": "ok", "message": "Restaura????o iniciada!"}
        else:
            return {"status": "error", "message": msg}

    elif action == "install_obs":
        if pm.is_running():
            return {"status": "error", "message": "Aguarde o processo atual terminar."}

        cmd = [sys.executable, "-m", "vhs_studio.cli.setup_obs"]
        success, msg = pm.start_process(cmd)

        if success:
            return {"status": "started", "message": "Instalador do OBS iniciado!"}
        else:
            return {"status": "error", "message": msg}

    elif action == "install_vapoursynth":
        if pm.is_running():
            return {"status": "error", "message": "Aguarde o processo atual terminar."}

        cmd = [sys.executable, "-m", "vhs_studio.cli.setup_qtgmc"]

        success, msg = pm.start_process(cmd)
        if success:
            return {"status": "ok", "message": "Instala????o do VapourSynth iniciada!"}
        else:
            return {"status": "error", "message": msg}

    elif action == "generate_subtitles":
        if pm.is_running():
            return {"status": "error", "message": "Aguarde o processo atual terminar."}

        input_file = params.get("input")
        model_size = params.get("model_size", "tiny")

        # Call an inline python script using ProcessManager so it streams logs to UI
        cmd = [
            sys.executable,
            "-c",
            f"from vhs_studio.ai.whisper_engine import transcribe_and_generate_vtt; transcribe_and_generate_vtt(r'{input_file}', '{model_size}')",
        ]

        success, msg = pm.start_process(cmd)
        if success:
            return {"status": "ok", "message": "Gera????o de legendas iniciada!"}
        else:
            return {"status": "error", "message": msg}

    elif action == "stop_process":
        if pm.terminate():
            return {"status": "ok", "message": "Processo encerrado via API."}
        return {"status": "error", "message": "Nenhum processo rodando."}

    return {"status": "error", "message": "A????o desconhecida"}


# Mount frontend
if os.path.isdir(DIST_DIR):
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="static")
else:

    @app.get("/")
    def index():
        return {"error": "UI n??o buildada. Execute 'npm run build' na pasta ui/"}


def run_server(port=8088):
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
