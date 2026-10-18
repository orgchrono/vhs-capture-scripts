import sys
import os
import platform
import shutil
from typing import Optional

# Detect PyInstaller frozen execution environment
IS_FROZEN = getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS")
BUNDLE_ROOT: str = str(getattr(sys, "_MEIPASS", "")) if IS_FROZEN else os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)

# Root of the project workspace (directory containing the executable if frozen, or repo root)
if IS_FROZEN:
    PROJECT_ROOT = os.path.dirname(sys.executable)
else:
    PROJECT_ROOT = BUNDLE_ROOT

# Directories: assets/UI served from bundle if frozen, media stored in workspace
TOOLS_DIR = os.path.join(BUNDLE_ROOT, "tools") if os.path.isdir(os.path.join(BUNDLE_ROOT, "tools")) else os.path.join(PROJECT_ROOT, "tools")
MEDIA_DIR = os.path.join(PROJECT_ROOT, "media")
RAW_MEDIA_DIR = os.path.join(MEDIA_DIR, "raw")
WORK_MEDIA_DIR = os.path.join(MEDIA_DIR, "work")
RESTORED_MEDIA_DIR = os.path.join(MEDIA_DIR, "restored")
UI_DIST_DIR = os.path.join(BUNDLE_ROOT, "ui", "dist") if os.path.isdir(os.path.join(BUNDLE_ROOT, "ui", "dist")) else os.path.join(PROJECT_ROOT, "ui", "dist")

# Tool paths
FFMPEG_DIR = os.path.join(TOOLS_DIR, "ffmpeg")
OBS_DIR = os.path.join(TOOLS_DIR, "obs")
REALESRGAN_DIR = os.path.join(TOOLS_DIR, "realesrgan")
CODEFORMER_DIR = os.path.join(TOOLS_DIR, "codeformer")
GFPGAN_DIR = os.path.join(TOOLS_DIR, "gfpgan")

# Config Files
USER_HOME = os.path.expanduser("~")
VHS_STUDIO_DIR = os.environ.get("VHS_STUDIO_DIR", os.path.join(USER_HOME, ".vhs_studio"))
STORAGE_CONFIG_PATH = os.path.join(VHS_STUDIO_DIR, "storage.json")
PREFERENCES_CONFIG_PATH = os.path.join(VHS_STUDIO_DIR, "preferences.json")
ADVANCED_CONFIG_PATH = os.path.join(BUNDLE_ROOT, "vhs_advanced_config.toml") if os.path.exists(os.path.join(BUNDLE_ROOT, "vhs_advanced_config.toml")) else os.path.join(PROJECT_ROOT, "vhs_advanced_config.toml")


def get_obs_executable_paths():
    """Return candidates for OBS executable paths across Windows, macOS, and Linux."""
    sys_name = platform.system()
    paths = []

    if sys_name == "Windows":
        paths.append(os.path.join(OBS_DIR, "bin", "64bit", "obs64.exe"))
        paths.append(r"C:\Program Files\obs-studio\bin\64bit\obs64.exe")
    elif sys_name == "Darwin":
        paths.append("/Applications/OBS.app/Contents/MacOS/OBS")
    elif sys_name == "Linux":
        paths.extend([
            "/usr/bin/obs",
            "/usr/local/bin/obs",
            "/var/lib/flatpak/exports/bin/com.obsproject.Studio",
            os.path.expanduser("~/.local/share/flatpak/exports/bin/com.obsproject.Studio"),
            "/snap/bin/obs-studio",
        ])

    which_obs = shutil.which("obs")
    if which_obs and which_obs not in paths:
        paths.insert(0, which_obs)

    return paths


def get_obs_cwd():
    """Return working directory for OBS if executing portable Windows bundle."""
    sys_name = platform.system()
    if sys_name == "Windows":
        return os.path.join(OBS_DIR, "bin", "64bit")
    return None


def get_ffmpeg_executable_path(binary_name="ffmpeg") -> Optional[str]:
    """Return path to FFmpeg binary if portable or available in system PATH."""
    sys_name = platform.system()
    bin_name = f"{binary_name}.exe" if sys_name == "Windows" else binary_name
    portable_path = os.path.join(FFMPEG_DIR, "bin", bin_name)
    if os.path.exists(portable_path):
        return portable_path

    which_path = shutil.which(bin_name) or shutil.which(binary_name)
    if which_path:
        return which_path

    return None


PANASONIC_TOOLS_DIR = os.path.join(TOOLS_DIR, "panasonic_rec")


def get_panasonic_executable_path(binary_name="extract_meihdfs"):
    """Return path to Panasonic recovery binary if portable or available in system PATH."""
    sys_name = platform.system()
    bin_name = f"{binary_name}.exe" if sys_name == "Windows" else binary_name
    candidates = [
        os.path.join(PANASONIC_TOOLS_DIR, bin_name),
        os.path.join(PANASONIC_TOOLS_DIR, "bin", bin_name),
        os.path.join(PANASONIC_TOOLS_DIR, binary_name),
    ]
    for cand in candidates:
        if os.path.exists(cand):
            return cand

    which_path = shutil.which(bin_name) or shutil.which(binary_name)
    if which_path:
        return which_path

    return None


def get_python_interpreter() -> str:
    """Return a working python interpreter executable, even when frozen inside PyInstaller."""
    if not getattr(sys, "frozen", False):
        return sys.executable

    # 1. Check virtualenv in project root or current working dir
    for root_dir in (PROJECT_ROOT, os.getcwd()):
        venv_py = os.path.join(root_dir, ".venv", "Scripts", "python.exe") if platform.system() == "Windows" else os.path.join(root_dir, ".venv", "bin", "python")
        if os.path.isfile(venv_py):
            return venv_py

    # 2. Check system PATH for python or py
    for cand in ("python", "python3", "py"):
        which_py = shutil.which(cand)
        if which_py and os.path.isfile(which_py):
            return which_py

    # 3. Check standard Windows Python paths
    if platform.system() == "Windows":
        local_appdata = os.environ.get("LOCALAPPDATA", "")
        py_appdata = os.path.join(local_appdata, "Programs", "Python")
        if os.path.isdir(py_appdata):
            for entry in os.listdir(py_appdata):
                cand = os.path.join(py_appdata, entry, "python.exe")
                if os.path.isfile(cand):
                    return cand
        py_core = os.path.join(local_appdata, "Python")
        if os.path.isdir(py_core):
            for entry in os.listdir(py_core):
                cand = os.path.join(py_core, entry, "python.exe")
                if os.path.isfile(cand):
                    return cand

    return sys.executable
