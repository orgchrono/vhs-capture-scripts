"""Module documentation pending."""

import sys
import os
import urllib.request
import json
import zipfile
import shutil
import platform
import subprocess
from vhs_studio.core.paths import TOOLS_DIR, OBS_DIR
from vhs_studio.core.constants import OBS_WEBSOCKET_PORT


from vhs_studio.cli.utils import print_step, print_success, print_error


def setup_windows_portable():
    """Documentation for setup_windows_portable."""
    if os.path.exists(OBS_DIR):
        print_success("OBS Studio (Portable) já está instalado no Windows.")
        return True

    os.makedirs(TOOLS_DIR, exist_ok=True)

    # 1. Obter URL do OBS via GitHub API
    print_step("Consultando versão mais recente do OBS Studio...")
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
            print_error("Não foi possível encontrar o ZIP do OBS para Windows.")
            return False
    except Exception as e:
        print_error(f"Erro na API do GitHub: {e}")
        return False

    # 2. Download do ZIP
    zip_path = os.path.join(TOOLS_DIR, "obs_installer.zip")
    print_step(f"Baixando OBS Studio Portable de {zip_url} ...")
    try:
        urllib.request.urlretrieve(zip_url, zip_path)  # nosec
    except Exception as e:
        print_error(f"Falha no download: {e}")
        return False

    # 3. Extrair
    print_step("Extraindo OBS Studio...")
    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        zip_ref.extractall(OBS_DIR)

    os.remove(zip_path)

    # 4. Ativar Modo Portátil
    print_step("Configurando Modo Portátil e WebSocket...")
    open(os.path.join(OBS_DIR, "obs_portable_mode.txt"), "w").close()

    # 5. Configurar WebSocket
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

    with open(os.path.join(config_dir, "config.json"), "w") as f:
        json.dump(ws_config, f, indent=4)

    print_success(
        f"OBS Studio Portable instalado e configurado na porta {OBS_WEBSOCKET_PORT}!"
    )
    return True


def setup_linux():
    """Install OBS Studio on Linux across Debian, Fedora, Arch, openSUSE and Flatpak."""
    print_step("Verificando OBS Studio no Linux...")
    if shutil.which("obs"):
        print_success("OBS Studio já está instalado.")
        return True

    from vhs_studio.core.package_manager import install_obs_crossplatform
    print_step("Instalando OBS Studio via gerenciador de pacotes da distribuição...")
    if install_obs_crossplatform():
        print_success("OBS Studio instalado com sucesso.")
        return True
    print_error("Falha ao instalar OBS Studio automaticamente no Linux.")
    return False


def setup_mac():
    """Documentation for setup_mac."""
    print_step("Verificando OBS Studio no macOS...")
    if shutil.which("obs") or os.path.exists("/Applications/OBS.app"):
        print_success("OBS Studio já está instalado.")
        return True

    print_step("Tentando instalar via Homebrew...")
    try:
        subprocess.run(["brew", "install", "--cask", "obs"], check=True)
        print_success("OBS instalado via Brew.")
        return True
    except Exception as e:
        print_error(f"Falha ao instalar via Brew: {e}")
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
        print_error(f"Sistema Operacional {sys_name} não suportado.")
        return False


if __name__ == "__main__":
    if install_obs():
        sys.exit(0)
    else:
        sys.exit(1)
