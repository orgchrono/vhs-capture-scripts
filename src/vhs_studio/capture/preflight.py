"""Module documentation pending."""

import os
import shutil
import subprocess
from vhs_studio.core.system_process import run_silent
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
    """Documentation for is_ffmpeg_in_path."""
    try:
        run_silent(["ffmpeg", "-version"], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def ensure_obs():
    """Verify that OBS Studio is available or invoke automated setup."""
    sys_name = platform.system()

    # 1. Check SSOT centralized paths
    obs_paths = get_obs_executable_paths()
    for obs_path in obs_paths:
        if os.path.exists(obs_path):
            log.info(f"[Preflight] OBS detected on system ({sys_name}): {obs_path}")
            return True

    if sys_name == "Linux" and shutil.which("obs"):
        log.info("[Preflight] OBS detected on system (Linux).")
        return True
    if sys_name == "Darwin" and shutil.which("obs"):
        log.info("[Preflight] OBS detected via PATH (macOS).")
        return True

    log.warning(
        f"[Preflight] OBS not found on {sys_name}. Starting installation fallback..."
    )
    try:
        success = install_obs()
        if success:
            log.info("[Preflight] OBS installed/configured successfully.")
            return True
        else:
            log.error("[Preflight] Failed to install OBS Studio.")
            return False
    except Exception as e:
        log.error(f"[Preflight] Critical error during automated OBS setup: {e}")
        return False


def ensure_ffmpeg():
    """Verify that FFmpeg is available on PATH or download portable package."""
    # 1. Try finding FFmpeg in native system PATH (Win/Mac/Linux)
    if is_ffmpeg_in_path():
        log.info("[Preflight] FFmpeg detected natively in system PATH.")
        return True

    sys_name = platform.system()

    # 2. Check local portable installation (via SSOT)
    portable_ffmpeg = get_ffmpeg_executable_path("ffmpeg")
    if portable_ffmpeg and os.path.exists(portable_ffmpeg):
        os.environ["PATH"] += os.pathsep + os.path.dirname(portable_ffmpeg)
        log.info("[Preflight] FFmpeg Portable injected into PATH.")
        return True

    # 3. Cross-platform fallback
    log.warning(
        f"[Preflight] FFmpeg missing. Starting fallback installation for {sys_name}..."
    )

    try:
        if sys_name in ["Linux", "Darwin"]:
            from vhs_studio.core.package_manager import install_ffmpeg_crossplatform
            return install_ffmpeg_crossplatform()

        elif sys_name == "Windows":
            log.info("[Preflight] Downloading FFmpeg Portable (Windows)...")
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
            log.info("[Preflight] FFmpeg Portable installed on Windows.")
            return True
        else:
            log.error(
                f"[Preflight] Unsupported system for automatic FFmpeg setup: {sys_name}"
            )
            return False

    except Exception as e:
        log.error(f"[Preflight] Catastrophic failure obtaining FFmpeg on {sys_name}: {e}")
        return False


def run_preflight_checks():
    """Run system-wide preflight checks before video capture or processing."""
    issues = []

    if not ensure_obs():
        issues.append("OBS Studio missing and installation failed.")

    if not ensure_ffmpeg():
        issues.append("FFmpeg missing and installation failed.")

    os.makedirs(RAW_MEDIA_DIR, exist_ok=True)
    total, used, free = shutil.disk_usage(RAW_MEDIA_DIR)
    free_gb = free / (1024**3)
    if free_gb < 50:
        issues.append(
            f"Insufficient disk space in media/raw: {free_gb:.1f}GB free (Recommended > 50GB)"
        )

    return {
        "status": "pass" if len(issues) == 0 else "fail",
        "issues": issues,
        "disk_free_gb": free_gb,
    }
