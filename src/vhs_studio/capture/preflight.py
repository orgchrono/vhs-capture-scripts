import os
import shutil
import subprocess
import urllib.request
import zipfile
import platform
from vhs_studio.core.logger import log
from vhs_studio.cli.setup_obs import install_obs
from vhs_studio.core.paths import (
    TOOLS_DIR,
    FFMPEG_DIR,
    RAW_MEDIA_DIR,
    get_obs_executable_paths,
    get_ffmpeg_executable_path,
)


def is_ffmpeg_in_path():
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def ensure_obs():
    sys_name = platform.system()

    # 1. Checa a partir dos paths centralizados SSOT
    obs_paths = get_obs_executable_paths()
    for obs_path in obs_paths:
        if os.path.exists(obs_path):
            log.info(f"[Preflight] OBS detectado no sistema ({sys_name}): {obs_path}")
            return True

    if sys_name == "Linux" and shutil.which("obs"):
        log.info("[Preflight] OBS detectado no sistema (Linux).")
        return True
    if sys_name == "Darwin" and shutil.which("obs"):
        log.info("[Preflight] OBS detectado via PATH (macOS).")
        return True

    log.warning(f"[Preflight] OBS não encontrado no {sys_name}. Iniciando fallback de instalação...")
    try:
        success = install_obs()
        if success:
            log.info("[Preflight] OBS instalado/configurado com sucesso.")
            return True
        else:
            log.error("[Preflight] Falha ao instalar OBS.")
            return False
    except Exception as e:
        log.error(f"[Preflight] Erro crítico no auto-setup do OBS: {e}")
        return False


def ensure_ffmpeg():
    # 1. Tenta achar no PATH nativo (Funciona em Win/Mac/Linux)
    if is_ffmpeg_in_path():
        log.info("[Preflight] FFmpeg detectado nativamente no PATH do sistema.")
        return True

    sys_name = platform.system()

    # 2. Verifica instalação portátil local (via SSOT)
    portable_ffmpeg = get_ffmpeg_executable_path("ffmpeg")
    if portable_ffmpeg and os.path.exists(portable_ffmpeg):
        os.environ["PATH"] += os.pathsep + os.path.dirname(portable_ffmpeg)
        log.info("[Preflight] FFmpeg Portable injetado no PATH.")
        return True

    # 3. Fallback Multiplataforma
    log.warning(f"[Preflight] FFmpeg ausente. Iniciando instalação fallback para {sys_name}...")

    try:
        if sys_name == "Linux":
            log.info("[Preflight] Tentando instalar FFmpeg via APT (Linux)...")
            subprocess.run(["sudo", "apt-get", "update"], check=True)
            subprocess.run(["sudo", "apt-get", "install", "-y", "ffmpeg"], check=True)
            return True

        elif sys_name == "Darwin":
            log.info("[Preflight] Tentando instalar FFmpeg via Homebrew (macOS)...")
            subprocess.run(["brew", "install", "ffmpeg"], check=True)
            return True

        elif sys_name == "Windows":
            log.info("[Preflight] Baixando FFmpeg Portable (Windows)...")
            os.makedirs(TOOLS_DIR, exist_ok=True)
            zip_path = os.path.join(TOOLS_DIR, "ffmpeg.zip")
            url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"

            urllib.request.urlretrieve(url, zip_path)  # nosec
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                extracted_folder = zip_ref.namelist()[0].split("/")[0]
                zip_ref.extractall(TOOLS_DIR)

            extracted_path = os.path.join(TOOLS_DIR, extracted_folder)
            if os.path.exists(FFMPEG_DIR):
                shutil.rmtree(FFMPEG_DIR)
            os.rename(extracted_path, FFMPEG_DIR)
            os.remove(zip_path)

            os.environ["PATH"] += os.pathsep + os.path.join(FFMPEG_DIR, "bin")
            log.info("[Preflight] FFmpeg Portable instalado no Windows.")
            return True
        else:
            log.error(f"[Preflight] Sistema não suportado para instalação automática de FFmpeg: {sys_name}")
            return False

    except Exception as e:
        log.error(f"[Preflight] Falha catastrófica ao obter FFmpeg no {sys_name}: {e}")
        return False


def run_preflight_checks():
    issues = []

    if not ensure_obs():
        issues.append("OBS Studio ausente e instalação falhou.")

    if not ensure_ffmpeg():
        issues.append("FFmpeg ausente e instalação falhou.")

    os.makedirs(RAW_MEDIA_DIR, exist_ok=True)
    total, used, free = shutil.disk_usage(RAW_MEDIA_DIR)
    free_gb = free / (1024**3)
    if free_gb < 50:
        issues.append(f"Espaço em disco insuficiente em media/raw: {free_gb:.1f}GB livre (Recomendado > 50GB)")

    return {
        "status": "pass" if len(issues) == 0 else "fail",
        "issues": issues,
        "disk_free_gb": free_gb,
    }
