import asyncio
import os
import json
import sys
import base64
import subprocess
from vhs_studio.core.system_process import run_silent, popen_silent
from typing import Dict, Mapping, Union, Optional, List, Tuple, Any
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse, Response

from vhs_studio.video.vapoursynth_qtgmc import VapourSynthQTGMC
from vhs_studio.api.routers.security import is_safe_media_path
from vhs_studio.core.paths import RAW_MEDIA_DIR, MEDIA_DIR, RESTORED_MEDIA_DIR
from vhs_studio.core.toolchain import Toolchain

restoration_router = APIRouter(prefix="/api", tags=["Restoration"])


@restoration_router.get("/monitor/live-restoration-frame")
def get_live_restoration_frame():
    """Retrieve the latest live frame actively processed by the restoration pipeline DAG."""
    from vhs_studio.video.stream_runner import RestorationFrameBuffer

    jpeg_bytes, frame_num, ts = RestorationFrameBuffer.get_instance().get_latest()
    if not jpeg_bytes:
        return Response(status_code=204)
    return Response(
        content=jpeg_bytes,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Frame-Number": str(frame_num),
            "X-Timestamp": f"{ts:.2f}",
        },
    )


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


def _build_cli_cmd(subcommand: str, *args: str) -> List[str]:
    """Construct CLI execution command respecting PyInstaller frozen environment and standard Python."""
    if getattr(sys, "frozen", False):
        return [sys.executable, subcommand, *args]
    return [sys.executable, "-m", "vhs_studio", subcommand, *args]


def _handle_start_restore(params: Mapping[str, object], pm):
    if pm.is_running():
        return {"status": "error", "message": "Já existe um processo em execução. Aguarde a finalização."}

    deint = str(params.get("deinterlacer", ""))
    if "qtgmc" in deint and not VapourSynthQTGMC.is_available():
        cmd = _build_cli_cmd("setup-qtgmc")
        pm.start_process(cmd)
        return {
            "status": "started",
            "message": "Installing QTGMC dependencies in the background.",
        }

    input_file = resolve_media_input_path(str(params.get("input", "")))
    if not is_safe_media_path(input_file):
        return {"status": "error", "message": "Invalid or insecure file path."}

    cmd = _build_cli_cmd(
        "pipeline",
        input_file,
        "--params-json",
        json.dumps(dict(params)),
    )
    success, msg = pm.start_process(cmd)
    if success:
        return {"status": "ok", "message": "Restoration pipeline started successfully."}
    return {"status": "error", "message": msg}


def _handle_install_obs(pm):
    if pm.is_running():
        return {"status": "error", "message": "Please wait for current process to finish."}
    cmd = _build_cli_cmd("setup-obs")
    success, msg = pm.start_process(cmd)
    if success:
        return {"status": "started", "message": "OBS portable installer started in the background."}
    return {"status": "error", "message": msg}


def _handle_install_vapoursynth(pm):
    if pm.is_running():
        return {"status": "error", "message": "Please wait for current process to finish."}
    cmd = _build_cli_cmd("setup-qtgmc")
    success, msg = pm.start_process(cmd)
    if success:
        return {"status": "ok", "message": "VapourSynth + QTGMC installer started in the background."}
    return {"status": "error", "message": msg}


def _resolve_safe_input_and_model_size(params: Mapping[str, object]) -> Tuple[Optional[str], str]:
    input_file = resolve_media_input_path(str(params.get("input", "")))
    if not is_safe_media_path(input_file):
        return None, "tiny"
    raw_size = str(params.get("model_size", "tiny"))
    valid_models = ("tiny", "base", "small", "medium", "large")
    model_size = raw_size if raw_size in valid_models else "tiny"
    return input_file, model_size


def _handle_generate_subtitles(params: Mapping[str, object], pm):
    if pm.is_running():
        return {"status": "error", "message": "Please wait for current process to finish."}

    input_file, model_size = _resolve_safe_input_and_model_size(params)
    if not input_file:
        return {"status": "error", "message": "Invalid or insecure file path."}

    raw_lang = str(params.get("language", "pt")).strip().lower()

    cmd = _build_cli_cmd(
        "subtitles",
        input_file,
        "--model-size",
        model_size,
        "--language",
        raw_lang,
    )
    success, msg = pm.start_process(cmd)
    if success:
        return {"status": "ok", "message": "AI subtitle generation started successfully."}
    return {"status": "error", "message": msg}


def _handle_detect_whisper_language(params: Mapping[str, object]) -> Dict[str, Any]:
    from vhs_studio.ai.whisper_engine import detect_first_speech_and_language

    input_file, model_size = _resolve_safe_input_and_model_size(params)
    if not input_file:
        return {"status": "error", "message": "Invalid or insecure file path."}

    res = detect_first_speech_and_language(input_file, model_size=model_size)
    return {"status": "ok", **res}


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
        return {"status": "ok", "message": "Process and signal successfully aborted."}
    return {"status": "error", "message": "No process currently running."}


def _handle_stop_process(pm):
    return _handle_abort_process(pm)


@restoration_router.post("/action")
async def perform_action(request: Request):
    """Execute asynchronous studio actions triggered from the frontend."""
    data = await request.json()
    action = data.get("action", "")
    params: Dict[str, object] = data.get("params", {})
    pm = _resolve_pm()

    if action == "detect_whisper_language":
        import asyncio
        return await asyncio.to_thread(_handle_detect_whisper_language, params)

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

    return {"status": "error", "message": "Unknown action."}


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
        synchronize_report_with_checkpoint,
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
        source = str(data.get("source", "")).strip()

        if os.path.exists(chk_path):
            try:
                with open(chk_path, "r", encoding="utf-8") as f:
                    chk_data = json.load(f)
                if not source:
                    source = str(chk_data.get("source", "")).strip()
            except Exception as e:
                return JSONResponse(status_code=500, content={"error": f"Erro lendo checkpoint: {e}"})
        elif not source:
            return JSONResponse(status_code=404, content={"error": "Checkpoint ou arquivo de origem não encontrado."})

        if not source or not os.path.exists(source):
            return JSONResponse(
                status_code=404,
                content={"error": "Arquivo original de entrada não foi encontrado."},
            )

        synchronize_report_with_checkpoint(output_path)
        params: Dict[str, object] = {
            "input": source,
            "output": output_path,
            "resume": True,
        }
        return _handle_start_restore(params, pm)

    return JSONResponse(status_code=400, content={"error": "Ação inválida."})


@restoration_router.get("/restoration/qc-report")
def get_qc_report(file_path: str = "", generate: bool = False):
    """Retrieve or generate the synchronized museum archival defect and restoration report."""
    from vhs_studio.capture.qc import QualityControl

    target = resolve_media_input_path(file_path) if file_path else ""
    if not target or not is_safe_media_path(target):
        return JSONResponse(status_code=400, content={"error": "Caminho inválido ou não seguro."})

    json_path = f"{target}_qc_report.json"
    md_path = f"{target}_defect_report.md"

    if generate and os.path.exists(target) and not os.path.exists(json_path):
        QualityControl.run_qc(target)

    if not os.path.exists(json_path):
        return JSONResponse(status_code=404, content={"exists": False})

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            report_data = json.load(f)
        md_text = ""
        if os.path.exists(md_path):
            with open(md_path, "r", encoding="utf-8") as mf:
                md_text = mf.read()
        return {
            "exists": True,
            "report_json_path": json_path,
            "report_md_path": md_path,
            "report": report_data,
            "markdown": md_text,
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@restoration_router.get("/restoration/check-existing")
def get_existing_restoration(source: str = ""):
    """Check if an existing partial or completed restoration is already recorded for this media source."""
    from vhs_studio.video.job_recovery import check_existing_restoration

    if not source:
        return {"has_existing": False}

    res = check_existing_restoration(source)
    if res:
        return {"has_existing": True, **res}
    return {"has_existing": False}


@restoration_router.post("/run")
async def run_pipeline(request: Request):

    """Run direct restoration pipeline endpoint for frontend integration."""
    params = await request.json()
    pm = _resolve_pm()

    if pm.is_running():
        return JSONResponse(status_code=400, content={"status": "error", "message": "A process is already running. Wait for completion."})

    input_file = resolve_media_input_path(params.get("input"))
    if not is_safe_media_path(input_file):
        return JSONResponse(status_code=400, content={"status": "error", "message": "Invalid or insecure file path."})

    cmd = _build_cli_cmd("pipeline", input_file, "--params-json", json.dumps(params))
    success, msg = pm.start_process(cmd)
    if success:
        return {"status": "ok", "message": "Restoration pipeline started successfully."}
    return JSONResponse(status_code=500, content={"status": "error", "message": msg})


@restoration_router.post("/install_qtgmc")
def install_qtgmc():
    """Launch background installer for VapourSynth and QTGMC."""
    pm = _resolve_pm()
    if pm.is_running():
        return {"status": "error", "message": "A process is already running. Wait for completion."}
    cmd = _build_cli_cmd("setup-qtgmc")
    success, msg = pm.start_process(cmd)
    if success:
        return {"status": "started", "message": "VapourSynth + QTGMC installer started in the background."}
    return {"status": "error", "message": msg}


def _get_ffmpeg_or_error() -> tuple[Optional[str], Optional[JSONResponse]]:
    try:
        return Toolchain.get_ffmpeg_path(), None
    except Exception as e:
        return None, JSONResponse(
            status_code=500,
            content={"status": "error", "message": f"FFmpeg não disponível: {e}"},
        )


def _is_widescreen_source(target_path: str) -> bool:
    """Detect whether media source is native 16:9 widescreen (>= 1280px wide) vs 4:3 SD VHS."""
    if not target_path:
        return False
    lower_name = os.path.basename(target_path).lower()
    if any(tag in lower_name for tag in ("1080p", "720p", "16x9", "widescreen")):
        return True
    if not os.path.exists(target_path):
        return False
    try:
        import cv2  # type: ignore[import-not-found]
        cap = cv2.VideoCapture(target_path)
        if cap.isOpened():
            w = float(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0.0)
            h = float(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0.0)
            cap.release()
            if w >= 1280 and h > 0 and (w / h) >= 1.65:
                return True
    except Exception:
        pass
    return False


def _resolve_preview_scale_filter(target_path: str) -> str:
    """Return FFmpeg scale+pad filter preserving 4:3 pillarbox for VHS SD sources or 16:9 for HD."""
    if _is_widescreen_source(target_path):
        return "scale=w=640:h=360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2"
    return "scale=w=480:h=360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2"


def _kill_stream_process_tree(proc: subprocess.Popen) -> None:
    """Forcefully terminate FFmpeg stream proxy process and any child processes on Windows/POSIX."""
    try:
        if proc.stdout:
            try:
                proc.stdout.close()
            except Exception:
                pass
        import psutil
        try:
            parent = psutil.Process(proc.pid)
            children = parent.children(recursive=True)
            for child in children:
                try:
                    child.kill()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            parent.kill()
            psutil.wait_procs(children + [parent], timeout=0.5)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    except Exception:
        pass
    finally:
        try:
            proc.kill()
            proc.wait(timeout=0.5)
        except Exception:
            pass


def _get_black_leader_offset(raw_path: str, restored_path: Optional[str] = None) -> float:
    """Retrieve black leader offset in seconds from QC reports or checkpoint."""
    candidates = []
    if raw_path:
        candidates.append(f"{raw_path}_qc_report.json")
    if restored_path:
        candidates.append(f"{restored_path}_qc_report.json")
        candidates.append(f"{restored_path}.checkpoint.json")
    for cp in candidates:
        if os.path.exists(cp):
            try:
                with open(cp, "r", encoding="utf-8") as f:
                    data = json.load(f)
                val = float(data.get("black_leader_sec", 0.0) or 0.0)
                if val > 0.0:
                    return val
            except Exception:
                pass
    return 0.0


def _find_existing_restored_master(raw_path: str) -> Optional[str]:
    """Locate an existing completed or partial restored master video file in media/restored."""
    if not raw_path or not os.path.exists(raw_path):
        return None
    stem = os.path.splitext(os.path.basename(raw_path))[0]

    sub_dir = os.path.join(RESTORED_MEDIA_DIR, stem)
    primary_candidates = [
        os.path.join(sub_dir, f"{stem}_restored_1080p.mp4"),
        os.path.join(sub_dir, f"{stem}_restored.mp4"),
        os.path.join(sub_dir, f"{stem}.mp4"),
        os.path.join(RESTORED_MEDIA_DIR, f"{stem}_restored_1080p.mp4"),
        os.path.join(RESTORED_MEDIA_DIR, f"{stem}_restored.mp4"),
        os.path.join(RESTORED_MEDIA_DIR, f"{stem}.mp4"),
    ]
    for cand in primary_candidates:
        if os.path.isfile(cand) and os.path.getsize(cand) > 100 * 1024:
            return cand

    candidates = []
    for search_dir in (sub_dir, RESTORED_MEDIA_DIR):
        if os.path.isdir(search_dir):
            try:
                for fname in os.listdir(search_dir):
                    lower = fname.lower()
                    if (
                        lower.endswith((".mp4", ".mkv", ".mov"))
                        and not any(x in lower for x in ("scene", "part", "tmp", "temp", "checkpoint"))
                        and stem.lower() in lower
                    ):
                        candidates.append(os.path.join(search_dir, fname))
            except Exception:
                pass

    valid_candidates = [
        c for c in candidates if os.path.isfile(c) and os.path.getsize(c) > 100 * 1024
    ]
    if valid_candidates:
        valid_candidates.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        return valid_candidates[0]
    return None


def _build_proxy_filters_base(
    deinterlacer: str,
    chroma_fix: bool,
    denoise: bool,
    scale_filter: str,
) -> List[str]:
    """Construct shared base video filters for restored proxy and comparison rendering."""
    filters = []
    if deinterlacer in ("bwdif", "qtgmc", "yadif"):
        filters.append("bwdif")
    if chroma_fix:
        filters.append("chromashift=cbh=2:cbv=1:crh=2:crv=1:edge=smear")
    if denoise:
        filters.append("hqdn3d=4.0:3.0:6.0:4.5")
    filters.extend(["unsharp=5:5:0.8:3:3:0.4", scale_filter])
    return filters


@restoration_router.get("/monitor/comparison-frame")
def get_comparison_frame(
    source: str = "",
    timestamp: float = 5.0,
    deinterlacer: str = "qtgmc",
    denoise: bool = True,
    chroma_fix: bool = True,
):
    """Extract lightweight 360p A/B comparison frames (RAW vs Processed) with minimal compute overhead."""
    target_path = resolve_media_input_path(source) if source else ""
    is_valid_source = bool(target_path and os.path.exists(target_path) and is_safe_media_path(target_path))

    ffmpeg_bin, err_resp = _get_ffmpeg_or_error()
    if err_resp or not ffmpeg_bin:
        return err_resp

    safe_time = max(0.0, float(timestamp))
    scale_filter = _resolve_preview_scale_filter(target_path)
    total_duration = 3600.0

    if is_valid_source:
        restored_master = _find_existing_restored_master(target_path)
        black_offset = _get_black_leader_offset(target_path, restored_master)

        try:
            from vhs_studio.core.vhs_common import probe_media

            probe_target = restored_master if restored_master else target_path
            meta = probe_media(probe_target)
            total_duration = float(meta.get("duration", 3600.0))
            if total_duration <= 0.0:
                total_duration = 3600.0
        except Exception:
            total_duration = 3600.0

        raw_seek_time = safe_time + black_offset if restored_master else safe_time
        cmd_raw = [
            ffmpeg_bin,
            "-hide_banner",
            "-loglevel", "error",
            "-ss", f"{raw_seek_time:.3f}",
            "-i", target_path,
            "-frames:v", "1",
            "-vf", scale_filter,
            "-f", "image2",
            "-c:v", "mjpeg",
            "pipe:1",
        ]

        if restored_master:
            cmd_proc = [
                ffmpeg_bin,
                "-hide_banner",
                "-loglevel", "error",
                "-ss", f"{safe_time:.3f}",
                "-i", restored_master,
                "-frames:v", "1",
                "-vf", scale_filter,
                "-f", "image2",
                "-c:v", "mjpeg",
                "pipe:1",
            ]
        else:
            vf_str = ",".join(
                _build_proxy_filters_base(deinterlacer, chroma_fix, denoise, scale_filter)
            )

            cmd_proc = [
                ffmpeg_bin,
                "-hide_banner",
                "-loglevel", "error",
                "-ss", f"{safe_time:.3f}",
                "-i", target_path,
                "-frames:v", "1",
                "-vf", vf_str,
                "-f", "image2",
                "-c:v", "mjpeg",
                "pipe:1",
            ]
    else:
        black_offset = 0.0
        restored_master = None
        cmd_raw = [
            ffmpeg_bin,
            "-hide_banner",
            "-loglevel", "error",
            "-f", "lavfi",
            "-i", "smptebars=size=640x360:rate=30,noise=c0s=25:allf=t+u,tinterlace=mode=interleave_top,hue=s=0.7",
            "-frames:v", "1",
            "-f", "image2",
            "-c:v", "mjpeg",
            "pipe:1",
        ]
        cmd_proc = [
            ffmpeg_bin,
            "-hide_banner",
            "-loglevel", "error",
            "-f", "lavfi",
            "-i", "smptebars=size=640x360:rate=30,unsharp=5:5:1.0",
            "-frames:v", "1",
            "-f", "image2",
            "-c:v", "mjpeg",
            "pipe:1",
        ]

    try:
        raw_res = run_silent(cmd_raw, capture_output=True, timeout=5)
        proc_res = run_silent(cmd_proc, capture_output=True, timeout=5)

        if raw_res.returncode != 0 or proc_res.returncode != 0 or not raw_res.stdout or not proc_res.stdout:
            return JSONResponse(
                status_code=500,
                content={"status": "error", "message": "Falha na geração dos quadros comparativos."},
            )

        raw_b64 = f"data:image/jpeg;base64,{base64.b64encode(raw_res.stdout).decode('ascii')}"
        proc_b64 = f"data:image/jpeg;base64,{base64.b64encode(proc_res.stdout).decode('ascii')}"

        return {
            "status": "ok",
            "timestamp": safe_time,
            "duration": round(total_duration, 2),
            "black_leader_sec": round(black_offset, 3),
            "has_restored_master": bool(restored_master),
            "raw_image": raw_b64,
            "processed_image": proc_b64,
            "width": 640,
            "height": 360,
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


def _build_proxy_processed_filters(
    deinterlacer: str,
    chroma_fix: bool,
    denoise: bool,
    scale_filter: str,
    fps_val: int,
) -> str:
    """Build the comma-separated FFmpeg video filter chain for proxy stream rendering."""
    vf_filters = _build_proxy_filters_base(deinterlacer, chroma_fix, denoise, scale_filter)
    vf_filters.append(f"fps={fps_val}")
    return ",".join(vf_filters)


@restoration_router.get("/monitor/stream-proxy")
async def get_stream_proxy(
    source: str = "",
    mode: str = "raw",
    deinterlacer: str = "qtgmc",
    denoise: bool = True,
    chroma_fix: bool = True,
    fps: int = 15,
    timestamp: float = 0.0,
):
    target_path = resolve_media_input_path(source) if source else ""
    if source and not is_safe_media_path(target_path):
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": "Invalid or insecure file path."},
        )

    is_valid_source = bool(target_path and os.path.exists(target_path) and is_safe_media_path(target_path))
    ffmpeg_bin, err_resp = _get_ffmpeg_or_error()
    if err_resp or not ffmpeg_bin:
        return err_resp

    fps_val = max(1, min(60, int(fps)))
    safe_time = max(0.0, float(timestamp))
    ss_args = ["-ss", f"{safe_time:.3f}"] if safe_time > 0 else []
    scale_filter = _resolve_preview_scale_filter(target_path)

    if is_valid_source:
        if mode == "raw":
            cmd = [
                ffmpeg_bin,
                "-hide_banner",
                "-loglevel", "error",
                *ss_args,
                "-re",
                "-stream_loop", "-1",
                "-i", target_path,
                "-vf", f"{scale_filter},fps={fps_val}",
                "-c:v", "mjpeg",
                "-q:v", "8",
                "-f", "mpjpeg",
                "-boundary_tag", "frame",
                "pipe:1",
            ]
        elif mode == "split":
            restored_master = _find_existing_restored_master(target_path)
            if restored_master:
                black_offset = _get_black_leader_offset(target_path, restored_master)
                raw_time = safe_time + black_offset
                raw_ss_args = ["-ss", f"{raw_time:.3f}"] if raw_time > 0 else []
                proc_ss_args = ["-ss", f"{safe_time:.3f}"] if safe_time > 0 else []

                filter_complex = (
                    f"[0:v]{scale_filter},fps={fps_val}[raw_out];"
                    f"[1:v]{scale_filter},fps={fps_val}[proc_out];"
                    f"[raw_out][proc_out]hstack=inputs=2[out]"
                )
                cmd = [
                    ffmpeg_bin,
                    "-hide_banner",
                    "-loglevel", "error",
                    *raw_ss_args,
                    "-re",
                    "-stream_loop", "-1",
                    "-i", target_path,
                    *proc_ss_args,
                    "-re",
                    "-stream_loop", "-1",
                    "-i", restored_master,
                    "-filter_complex", filter_complex,
                    "-map", "[out]",
                    "-c:v", "mjpeg",
                    "-q:v", "8",
                    "-f", "mpjpeg",
                    "-boundary_tag", "frame",
                    "pipe:1",
                ]
            else:
                proc_vf = _build_proxy_processed_filters(
                    deinterlacer, chroma_fix, denoise, scale_filter, fps_val
                )

                filter_complex = (
                    f"[0:v]split=2[raw_in][proc_in];"
                    f"[raw_in]{scale_filter},fps={fps_val}[raw_out];"
                    f"[proc_in]{proc_vf}[proc_out];"
                    f"[raw_out][proc_out]hstack=inputs=2[out]"
                )
                cmd = [
                    ffmpeg_bin,
                    "-hide_banner",
                    "-loglevel", "error",
                    *ss_args,
                    "-re",
                    "-stream_loop", "-1",
                    "-i", target_path,
                    "-filter_complex", filter_complex,
                    "-map", "[out]",
                    "-c:v", "mjpeg",
                    "-q:v", "8",
                    "-f", "mpjpeg",
                    "-boundary_tag", "frame",
                    "pipe:1",
                ]
        else:
            vf_str = _build_proxy_processed_filters(
                deinterlacer, chroma_fix, denoise, scale_filter, fps_val
            )

            cmd = [
                ffmpeg_bin,
                "-hide_banner",
                "-loglevel", "error",
                "-re",
                *ss_args,
                "-stream_loop", "-1",
                "-i", target_path,
                "-vf", vf_str,
                "-c:v", "mjpeg",
                "-q:v", "8",
                "-f", "mpjpeg",
                "-boundary_tag", "frame",
                "pipe:1",
            ]
    else:
        if mode == "raw":
            cmd = [
                ffmpeg_bin,
                "-hide_banner",
                "-loglevel", "error",
                "-re",
                "-f", "lavfi",
                "-i", f"smptebars=size=640x360:rate={fps_val},noise=c0s=18:allf=t+u,tinterlace=mode=interleave_top",
                "-c:v", "mjpeg",
                "-q:v", "8",
                "-f", "mpjpeg",
                "-boundary_tag", "frame",
                "pipe:1",
            ]
        elif mode == "split":
            filter_complex = (
                "[0:v]scale=640:360,noise=c0s=18:allf=t+u[raw_out];"
                "[1:v]scale=640:360[proc_out];"
                "[raw_out][proc_out]hstack=inputs=2[out]"
            )
            cmd = [
                ffmpeg_bin,
                "-hide_banner",
                "-loglevel", "error",
                "-re",
                "-f", "lavfi",
                "-i", f"smptebars=size=640x360:rate={fps_val}",
                "-f", "lavfi",
                "-i", f"smptebars=size=640x360:rate={fps_val}",
                "-filter_complex", filter_complex,
                "-map", "[out]",
                "-c:v", "mjpeg",
                "-q:v", "8",
                "-f", "mpjpeg",
                "-boundary_tag", "frame",
                "pipe:1",
            ]
        else:
            cmd = [
                ffmpeg_bin,
                "-hide_banner",
                "-loglevel", "error",
                "-re",
                "-f", "lavfi",
                "-i", f"smptebars=size=640x360:rate={fps_val}",
                "-c:v", "mjpeg",
                "-q:v", "8",
                "-f", "mpjpeg",
                "-boundary_tag", "frame",
                "pipe:1",
            ]

    async def stream_generator():
        proc = popen_silent(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=64 * 1024,
        )
        try:
            while True:
                if proc.stdout is None:
                    break
                chunk = await asyncio.to_thread(proc.stdout.read, 16384)
                if not chunk:
                    break
                yield chunk
        except asyncio.CancelledError:
            pass
        finally:
            await asyncio.to_thread(_kill_stream_process_tree, proc)

    return StreamingResponse(
        stream_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "close",
        },
    )
