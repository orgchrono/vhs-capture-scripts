import os
import shutil
import subprocess
import urllib.request
import zipfile
import sys
from vhs_studio.core.logger import log
from vhs_studio.cli.setup_obs import install_obs

TOOLS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "tools"))
FFMPEG_DIR = os.path.join(TOOLS_DIR, "ffmpeg")
OBS_PORTABLE = os.path.join(TOOLS_DIR, "obs", "bin", "64bit", "obs64.exe")
OBS_SYSTEM = r"C:\Program Files\obs-studio\bin\64bit\obs64.exe"


def ensure_obs():
    if os.path.exists(OBS_SYSTEM):
        log.info("[Preflight] OBS detectado no sistema.")
        return True
    if os.path.exists(OBS_PORTABLE):
        log.info("[Preflight] OBS Portable detectado na pasta tools.")
        return True

    log.warning("[Preflight] OBS não encontrado. Iniciando fallback de download e instalação portátil...")
    try:
        success = install_obs()
        if success:
            log.info("[Preflight] OBS baixado e configurado com sucesso.")
            return True
        else:
            log.error("[Preflight] Falha ao baixar OBS.")
            return False
    except Exception as e:
        log.error(f"[Preflight] Erro crítico no auto-setup do OBS: {e}")
        return False


def ensure_ffmpeg():
    # 1. Tenta achar no PATH nativo
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        log.info("[Preflight] FFmpeg detectado no PATH do sistema.")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    # 2. Verifica se já temos na pasta tools/ffmpeg
    ffmpeg_exe = os.path.join(FFMPEG_DIR, "bin", "ffmpeg.exe")
    if os.path.exists(ffmpeg_exe):
        # Injeta temporariamente no PATH dessa execução
        os.environ["PATH"] += os.pathsep + os.path.join(FFMPEG_DIR, "bin")
        log.info("[Preflight] FFmpeg Portable detectado e injetado no PATH.")
        return True

    # 3. Fallback de Download Automático
    log.warning("[Preflight] FFmpeg não encontrado. Iniciando download da build estática (BtbN)...")
    os.makedirs(TOOLS_DIR, exist_ok=True)
    zip_path = os.path.join(TOOLS_DIR, "ffmpeg.zip")
    url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"

    try:
        log.info(f"[Preflight] Baixando: {url}")
        urllib.request.urlretrieve(url, zip_path)
        log.info("[Preflight] Extraindo FFmpeg...")
        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            # Extrai tudo para TOOLS_DIR
            extracted_folder = zip_ref.namelist()[0].split("/")[0]
            zip_ref.extractall(TOOLS_DIR)

        # Renomeia a pasta feia (ex: ffmpeg-master-latest-win64-gpl) para "ffmpeg"
        extracted_path = os.path.join(TOOLS_DIR, extracted_folder)
        if os.path.exists(FFMPEG_DIR):
            shutil.rmtree(FFMPEG_DIR)
        os.rename(extracted_path, FFMPEG_DIR)
        os.remove(zip_path)

        # Injeta no PATH
        os.environ["PATH"] += os.pathsep + os.path.join(FFMPEG_DIR, "bin")
        log.info("[Preflight] FFmpeg instalado e atualizado com sucesso!")
        return True
    except Exception as e:
        log.error(f"[Preflight] Falha ao fazer download/instalação do FFmpeg: {e}")
        return False


def run_preflight_checks():
    issues = []

    # Check & Auto-Install OBS
    if not ensure_obs():
        issues.append("OBS Studio ausente e fallback de download falhou.")

    # Check & Auto-Install FFmpeg
    if not ensure_ffmpeg():
        issues.append("FFmpeg ausente e fallback de download falhou.")

    # Check Disk Space
    raw_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "media", "raw"))
    os.makedirs(raw_dir, exist_ok=True)
    total, used, free = shutil.disk_usage(raw_dir)
    free_gb = free / (1024**3)
    if free_gb < 50:
        issues.append(f"Espaço em disco insuficiente em media/raw: {free_gb:.1f}GB livre (Recomendado > 50GB)")

    return {
        "status": "pass" if len(issues) == 0 else "fail",
        "issues": issues,
        "disk_free_gb": free_gb,
    }
