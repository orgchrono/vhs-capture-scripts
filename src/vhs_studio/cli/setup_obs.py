"""Module documentation pending."""

import sys
import os
import urllib.request
import json
import zipfile
import shutil
import platform
from vhs_studio.core.system_process import run_silent
from vhs_studio.core.paths import TOOLS_DIR, OBS_DIR, get_obs_executable_paths
from vhs_studio.core.constants import OBS_WEBSOCKET_PORT


from vhs_studio.cli.utils import print_step, print_success, print_error


def setup_windows_portable():
    """Check for existing OBS Studio installation across system before downloading portable version."""
    for obs_cand in get_obs_executable_paths():
        if os.path.exists(obs_cand):
            print_success(f"OBS Studio is already installed on the system: {obs_cand}")
            return True

    os.makedirs(TOOLS_DIR, exist_ok=True)

    # 1. Fetch OBS release URL via GitHub API
    print_step("Checking latest OBS Studio release from GitHub...")
    req = urllib.request.Request(
        "https://api.github.com/repos/obsproject/obs-studio/releases/latest",
        headers={"User-Agent": "VHS-Studio"},
    )
    try:
        resp = urllib.request.urlopen(req)  # nosec
        data = json.loads(resp.read().decode())
        zip_url = None
        for asset in data.get("assets", []):
            if asset["name"].endswith(".zip") and "Windows" in asset["name"]:
                zip_url = asset["browser_download_url"]
                break
        if not zip_url:
            print_error("Unable to locate OBS Windows ZIP asset in release.")
            return False
    except Exception as e:
        print_error(f"GitHub API request failed: {e}")
        return False

    # 2. Download ZIP
    zip_path = os.path.join(TOOLS_DIR, "obs_installer.zip")
    print_step(f"Downloading OBS Studio Portable from {zip_url} ...")
    try:
        urllib.request.urlretrieve(zip_url, zip_path)  # nosec
    except Exception as e:
        print_error(f"Download failed: {e}")
        return False

    # 3. Extract
    print_step("Extracting OBS Studio...")
    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        zip_ref.extractall(OBS_DIR)

    os.remove(zip_path)

    # 4. Activate Portable Mode
    print_step("Configuring Portable Mode and WebSocket...")
    open(os.path.join(OBS_DIR, "obs_portable_mode.txt"), "w", encoding="utf-8").close()

    # 5. Configure WebSocket
    config_dir = os.path.join(
        OBS_DIR, "config", "obs-studio", "plugin_config", "obs-websocket"
    )
    os.makedirs(config_dir, exist_ok=True)

    ws_config = {
        "DebugEnabled": False,
        "ServerPort": OBS_WEBSOCKET_PORT,
        "ServerEnabled": True,
        "AuthRequired": False,
        "AuthSecret": "",
    }

    with open(os.path.join(config_dir, "config.json"), "w", encoding="utf-8") as f:
        json.dump(ws_config, f, indent=4)

    print_success(
        f"OBS Studio Portable installed and configured on port {OBS_WEBSOCKET_PORT}!"
    )
    return True


def setup_linux():
    """Install OBS Studio on Linux across Debian, Fedora, Arch, openSUSE and Flatpak."""
    print_step("Checking OBS Studio on Linux...")
    if shutil.which("obs"):
        print_success("OBS Studio is already installed.")
        return True

    from vhs_studio.core.package_manager import install_obs_crossplatform
    print_step("Installing OBS Studio via distribution package manager...")
    if install_obs_crossplatform():
        print_success("OBS Studio installed successfully.")
        return True
    print_error("Failed to install OBS Studio automatically on Linux.")
    return False


def setup_mac():
    """Documentation for setup_mac."""
    print_step("Checking OBS Studio on macOS...")
    if shutil.which("obs") or os.path.exists("/Applications/OBS.app"):
        print_success("OBS Studio is already installed.")
        return True

    print_step("Attempting installation via Homebrew...")
    try:
        run_silent(["brew", "install", "--cask", "obs"], check=True)
        print_success("OBS installed via Brew.")
        return True
    except Exception as e:
        print_error(f"Failed to install via Homebrew: {e}")
        return False


def install_obs():
    """Documentation for install_obs."""
    sys_name = platform.system()
    if sys_name == "Windows":
        return setup_windows_portable()
    elif sys_name == "Linux":
        return setup_linux()
    elif sys_name == "Darwin":
        return setup_mac()
    else:
        print_error(f"Operating System '{sys_name}' is not supported.")
        return False


if __name__ == "__main__":
    if install_obs():
        sys.exit(0)
    else:
        sys.exit(1)
