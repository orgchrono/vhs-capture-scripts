import os
import json
import sys
from typing import Dict, Mapping
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from vhs_studio.video.vapoursynth_qtgmc import VapourSynthQTGMC
from vhs_studio.api.routers.security import is_safe_media_path
from vhs_studio.core.paths import RAW_MEDIA_DIR, MEDIA_DIR

restoration_router = APIRouter(prefix="/api", tags=["Restoration"])


def resolve_media_input_path(input_file: str) -> str:
    """Resolve plain file names to their canonical path in RAW_MEDIA_DIR or MEDIA_DIR if present."""
    if not input_file:
        return input_file
    base = os.path.basename(input_file)
    if base == input_file.strip():
        raw_target = os.path.join(RAW_MEDIA_DIR, base)
        if os.path.exists(raw_target):
            return raw_target
        media_target = os.path.join(MEDIA_DIR, base)
        if os.path.exists(media_target):
            return media_target
    return input_file


def _resolve_pm():
    """Retrieve process manager instance through server module to respect mock isolation in tests."""
    import vhs_studio.api.server as server
    return server.pm


def _handle_start_restore(params: Mapping[str, object], pm):
    if pm.is_running():
        return {"status": "error", "message": "Já existe um processo em execução. Aguarde a finalização."}

    deint = str(params.get("deinterlacer", ""))
    if "qtgmc" in deint and not VapourSynthQTGMC.is_available():
        cmd = [sys.executable, "-m", "vhs_studio.cli.setup_qtgmc"]
        pm.start_process(cmd)
        return {
            "status": "started",
            "message": "Instalando dependências do QTGMC em segundo plano.",
        }

    input_file = resolve_media_input_path(str(params.get("input", "")))
    if not is_safe_media_path(input_file):
        return {"status": "error", "message": "Caminho de arquivo inválido ou não seguro."}

    cmd = [
        sys.executable,
        "-m",
        "vhs_studio",
        "pipeline",
        input_file,
        "--params-json",
        json.dumps(dict(params)),
    ]
    success, msg = pm.start_process(cmd)
    if success:
        return {"status": "ok", "message": "Pipeline de restauração iniciada com sucesso."}
    return {"status": "error", "message": msg}


def _handle_install_obs(pm):
    if pm.is_running():
        return {"status": "error", "message": "Aguarde a conclusão do processo em andamento."}
    cmd = [sys.executable, "-m", "vhs_studio.cli.setup_obs"]
    success, msg = pm.start_process(cmd)
    if success:
        return {"status": "started", "message": "Instalador do OBS Portable iniciado em segundo plano."}
    return {"status": "error", "message": msg}


def _handle_install_vapoursynth(pm):
    if pm.is_running():
        return {"status": "error", "message": "Aguarde a conclusão do processo em andamento."}
    cmd = [sys.executable, "-m", "vhs_studio.cli.setup_qtgmc"]
    success, msg = pm.start_process(cmd)
    if success:
        return {"status": "ok", "message": "Instalador do VapourSynth + QTGMC iniciado em segundo plano."}
    return {"status": "error", "message": msg}


def _handle_generate_subtitles(params: Mapping[str, object], pm):
    if pm.is_running():
        return {"status": "error", "message": "Aguarde a conclusão do processo em andamento."}

    input_file = resolve_media_input_path(str(params.get("input", "")))
    if not is_safe_media_path(input_file):
        return {"status": "error", "message": "Caminho de arquivo inválido ou não seguro."}

    raw_size = str(params.get("model_size", "tiny"))
    valid_models = ("tiny", "base", "small", "medium", "large")
    model_size = raw_size if raw_size in valid_models else "tiny"

    cmd = [
        sys.executable,
        "-c",
        "import sys; from vhs_studio.ai.whisper_engine import transcribe_and_generate_vtt; transcribe_and_generate_vtt(sys.argv[1], sys.argv[2])",
        input_file,
        model_size,
    ]
    success, msg = pm.start_process(cmd)
    if success:
        return {"status": "ok", "message": "Geração de legendas IA iniciada com sucesso."}
    return {"status": "error", "message": msg}


def _handle_stop_process(pm):
    if pm.terminate():
        return {"status": "ok", "message": "Processo cancelado com sucesso."}
    return {"status": "error", "message": "Nenhum processo em execução no momento."}


@restoration_router.post("/action")
async def perform_action(request: Request):
    """Execute asynchronous studio actions triggered from the frontend."""
    data = await request.json()
    action = data.get("action", "")
    params: Dict[str, object] = data.get("params", {})
    pm = _resolve_pm()

    dispatch_table = {
        "start_restore": lambda: _handle_start_restore(params, pm),
        "install_obs": lambda: _handle_install_obs(pm),
        "install_vapoursynth": lambda: _handle_install_vapoursynth(pm),
        "generate_subtitles": lambda: _handle_generate_subtitles(params, pm),
        "stop_process": lambda: _handle_stop_process(pm),
    }

    handler = dispatch_table.get(action)
    if handler:
        return handler()

    return {"status": "error", "message": "Ação desconhecida solicitada."}


@restoration_router.post("/run")
async def run_pipeline(request: Request):
    """Run direct restoration pipeline endpoint for frontend integration."""
    params = await request.json()
    pm = _resolve_pm()

    if pm.is_running():
        return JSONResponse(status_code=400, content={"status": "error", "message": "Já existe um processo em execução. Aguarde a finalização."})

    input_file = resolve_media_input_path(params.get("input"))
    if not is_safe_media_path(input_file):
        return JSONResponse(status_code=400, content={"status": "error", "message": "Caminho de arquivo inválido ou não seguro."})

    cmd = [
        sys.executable,
        "-m",
        "vhs_studio",
        "pipeline",
        input_file,
        "--params-json",
        json.dumps(params),
    ]
    success, msg = pm.start_process(cmd)
    if success:
        return {"status": "ok", "message": "Pipeline de restauração iniciada com sucesso."}
    return JSONResponse(status_code=500, content={"status": "error", "message": msg})


@restoration_router.post("/install_qtgmc")
def install_qtgmc():
    """Launch background installer for VapourSynth and QTGMC."""
    pm = _resolve_pm()
    if pm.is_running():
        return {"status": "error", "message": "Já existe um processo em execução. Aguarde a finalização."}
    cmd = [sys.executable, "-m", "vhs_studio.cli.setup_qtgmc"]
    success, msg = pm.start_process(cmd)
    if success:
        return {"status": "started", "message": "Instalação do VapourSynth + QTGMC iniciada em segundo plano."}
    return {"status": "error", "message": msg}
