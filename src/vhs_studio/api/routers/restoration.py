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


def _handle_pause_process(pm):
    ok, msg = pm.pause()
    if ok:
        return {"status": "ok", "message": msg}
    return {"status": "error", "message": msg}


def _handle_resume_process(pm):
    ok, msg = pm.resume()
    if ok:
        return {"status": "ok", "message": msg}
    return {"status": "error", "message": msg}


def _handle_abort_process(pm):
    if pm.terminate():
        return {"status": "ok", "message": "Processo e sinal interrompidos com sucesso (Abort)."}
    return {"status": "error", "message": "Nenhum processo em execução para interromper."}


def _handle_stop_process(pm):
    return _handle_abort_process(pm)


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
        "abort_process": lambda: _handle_abort_process(pm),
        "pause_process": lambda: _handle_pause_process(pm),
        "resume_process": lambda: _handle_resume_process(pm),
    }

    handler = dispatch_table.get(action)
    if handler:
        return handler()

    return {"status": "error", "message": "Ação desconhecida solicitada."}


@restoration_router.get("/restoration/status")
def get_restoration_status():
    """Return real-time active and paused execution state."""
    pm = _resolve_pm()
    return {
        "active": pm.is_running(),
        "is_paused": getattr(pm, "is_paused", False),
    }


@restoration_router.get("/restoration/incomplete")
def get_incomplete_restoration_jobs():
    """Scan and return all interrupted or in-progress restoration jobs available for resumption."""
    from vhs_studio.video.job_recovery import scan_incomplete_jobs

    jobs = scan_incomplete_jobs()
    return {"incomplete_jobs": jobs, "total": len(jobs)}


@restoration_router.post("/restoration/incomplete/action")
async def handle_incomplete_action(request: Request):
    """Resume, finalize partial container, or discard incomplete job."""
    from vhs_studio.video.job_recovery import (
        finalize_partial_video,
        discard_incomplete_job,
    )

    data = await request.json()
    output_path = data.get("output_path", "")
    subaction = data.get("action", "")

    if not output_path:
        return JSONResponse(status_code=400, content={"error": "output_path is required."})

    if subaction == "finalize":
        res = finalize_partial_video(output_path)
        if res:
            return {
                "status": "ok",
                "message": "Vídeo parcial finalizado com sucesso.",
                "finalized_file": res,
            }
        return JSONResponse(status_code=500, content={"error": "Falha ao finalizar o vídeo parcial."})

    elif subaction == "discard":
        ok = discard_incomplete_job(output_path)
        if ok:
            return {"status": "ok", "message": "Arquivos temporários descartados com sucesso."}
        return JSONResponse(status_code=500, content={"error": "Falha ao descartar arquivos do projeto."})

    elif subaction == "resume":
        pm = _resolve_pm()
        if pm.is_running():
            return JSONResponse(status_code=400, content={"error": "Já existe um processo em execução."})

        chk_path = f"{output_path}.checkpoint.json"
        if not os.path.exists(chk_path):
            return JSONResponse(status_code=404, content={"error": "Checkpoint não encontrado."})

        try:
            with open(chk_path, "r", encoding="utf-8") as f:
                chk_data = json.load(f)
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": f"Erro lendo checkpoint: {e}"})

        source = chk_data.get("source", "")
        if not source or not os.path.exists(source):
            return JSONResponse(
                status_code=404,
                content={"error": "Arquivo original de entrada não foi encontrado."},
            )

        params: Dict[str, object] = {
            "input": source,
            "output": output_path,
            "resume": True,
        }
        return _handle_start_restore(params, pm)

    return JSONResponse(status_code=400, content={"error": "Ação inválida."})


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
