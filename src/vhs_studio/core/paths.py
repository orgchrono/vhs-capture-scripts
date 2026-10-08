"""Module documentation pending."""

import os
import platform

# Root of the vhs-capture-scripts repository
PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)

# Directories
TOOLS_DIR = os.path.join(PROJECT_ROOT, "tools")
MEDIA_DIR = os.path.join(PROJECT_ROOT, "media")
RAW_MEDIA_DIR = os.path.join(MEDIA_DIR, "raw")
WORK_MEDIA_DIR = os.path.join(MEDIA_DIR, "work")
RESTORED_MEDIA_DIR = os.path.join(MEDIA_DIR, "restored")
UI_DIST_DIR = os.path.join(PROJECT_ROOT, "ui", "dist")

# Tool paths
FFMPEG_DIR = os.path.join(TOOLS_DIR, "ffmpeg")
OBS_DIR = os.path.join(TOOLS_DIR, "obs")
REALESRGAN_DIR = os.path.join(TOOLS_DIR, "realesrgan")

# Config Files
USER_HOME = os.path.expanduser("~")
VHS_STUDIO_DIR = os.path.join(USER_HOME, ".vhs_studio")
STORAGE_CONFIG_PATH = os.path.join(VHS_STUDIO_DIR, "storage.json")
ADVANCED_CONFIG_PATH = os.path.join(PROJECT_ROOT, "vhs_advanced_config.toml")


def get_obs_executable_paths():
    """Documentation for get_obs_executable_paths."""
    sys_name = platform.system()
    paths = []

    if sys_name == "Windows":
        paths.append(os.path.join(OBS_DIR, "bin", "64bit", "obs64.exe"))
        paths.append(r"C:\Program Files\obs-studio\bin\64bit\obs64.exe")
    elif sys_name == "Darwin":
        paths.append("/Applications/OBS.app/Contents/MacOS/OBS")

    return paths


def get_obs_cwd():
    """Documentation for get_obs_cwd."""
    sys_name = platform.system()
    if sys_name == "Windows":
        return os.path.join(OBS_DIR, "bin", "64bit")
    return None


def get_ffmpeg_executable_path(binary_name="ffmpeg"):
    """Documentation for get_ffmpeg_executable_path."""
    sys_name = platform.system()
    if sys_name == "Windows":
        portable_path = os.path.join(FFMPEG_DIR, "bin", f"{binary_name}.exe")
        if os.path.exists(portable_path):
            return portable_path

    return None
