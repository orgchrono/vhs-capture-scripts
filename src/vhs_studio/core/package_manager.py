"""Cross-platform system package manager detection and automated toolchain provisioning."""

import os
import shutil
import platform
import subprocess  # nosec
from typing import Optional, List
from vhs_studio.core.logger import log


def get_linux_distro_id() -> str:
    """Detect Linux distribution ID from /etc/os-release."""
    if platform.system() != "Linux":
        return ""
    try:
        if hasattr(platform, "freedesktop_os_release"):
            info = platform.freedesktop_os_release()
            return info.get("ID", "").lower()
    except Exception:
        pass

    if os.path.exists("/etc/os-release"):
        try:
            with open("/etc/os-release", "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("ID="):
                        return line.strip().split("=")[1].strip('"').lower()
        except Exception:
            pass
    return "linux"


def detect_package_manager() -> Optional[str]:
    """Detect available package manager on current operating system."""
    sys_name = platform.system()
    if sys_name == "Darwin":
        if shutil.which("brew"):
            return "brew"
        return None

    if sys_name == "Windows":
        if shutil.which("winget"):
            return "winget"
        if shutil.which("choco"):
            return "choco"
        return None

    if sys_name == "Linux":
        for mgr in ["apt-get", "dnf", "yum", "pacman", "zypper", "apk", "brew"]:
            if shutil.which(mgr):
                return mgr

    return None


def run_system_install(cmd: List[str]) -> bool:
    """Execute system package install command with elevation if needed."""
    try:
        # Prepend sudo if on Unix, not root, and sudo is available
        is_root = getattr(os, "geteuid", lambda: -1)() == 0
        if platform.system() != "Windows" and not is_root and shutil.which("sudo"):
            cmd = ["sudo"] + cmd
        log.info(f"[PackageManager] Executando: {' '.join(cmd)}")
        res = subprocess.run(cmd, check=True)  # nosec
        return res.returncode == 0
    except (subprocess.CalledProcessError, FileNotFoundError, PermissionError) as e:
        log.error(f"[PackageManager] Falha na execucao de comando ({' '.join(cmd)}): {e}")
        return False


def install_ffmpeg_crossplatform() -> bool:
    """Install FFmpeg across Debian, Fedora, Arch, openSUSE, Alpine, macOS, and Windows."""
    sys_name = platform.system()
    mgr = detect_package_manager()

    if sys_name == "Darwin":
        if mgr == "brew":
            return run_system_install(["brew", "install", "ffmpeg"])
        log.error("[PackageManager] Homebrew ausente no macOS. Instale brew ou ffmpeg manualmente.")
        return False

    if sys_name == "Linux":
        if mgr == "apt-get":
            run_system_install(["apt-get", "update"])
            return run_system_install(["apt-get", "install", "-y", "ffmpeg"])
        elif mgr in ["dnf", "yum"]:
            return run_system_install([mgr, "install", "-y", "ffmpeg"])
        elif mgr == "pacman":
            return run_system_install(["pacman", "-S", "--noconfirm", "ffmpeg"])
        elif mgr == "zypper":
            return run_system_install(["zypper", "--non-interactive", "install", "ffmpeg"])
        elif mgr == "apk":
            return run_system_install(["apk", "add", "ffmpeg"])
        elif mgr == "brew":
            return run_system_install(["brew", "install", "ffmpeg"])

        log.error(f"[PackageManager] Nenhum gerenciador de pacotes suportado encontrado no Linux (Distro: {get_linux_distro_id()}).")
        return False

    return False


def install_obs_crossplatform() -> bool:
    """Install OBS Studio across Debian, Fedora, Arch, openSUSE, Flatpak, macOS, and Windows."""
    sys_name = platform.system()
    mgr = detect_package_manager()

    if sys_name == "Darwin":
        if mgr == "brew":
            return run_system_install(["brew", "install", "--cask", "obs"])
        log.error("[PackageManager] Homebrew ausente no macOS para instalar OBS Studio.")
        return False

    if sys_name == "Linux":
        if mgr == "apt-get":
            run_system_install(["apt-get", "update"])
            return run_system_install(["apt-get", "install", "-y", "obs-studio"])
        elif mgr in ["dnf", "yum"]:
            return run_system_install([mgr, "install", "-y", "obs-studio"])
        elif mgr == "pacman":
            return run_system_install(["pacman", "-S", "--noconfirm", "obs-studio"])
        elif mgr == "zypper":
            return run_system_install(["zypper", "--non-interactive", "install", "obs-studio"])

        # Fallback to Flatpak if available
        if shutil.which("flatpak"):
            log.info("[PackageManager] Tentando instalar OBS Studio via Flatpak...")
            return run_system_install(["flatpak", "install", "-y", "flathub", "com.obsproject.Studio"])

        log.error(f"[PackageManager] Nao foi possivel instalar OBS Studio no Linux (Distro: {get_linux_distro_id()}).")
        return False

    return False


def install_vapoursynth_crossplatform() -> bool:
    """Install VapourSynth across Debian, Fedora, Arch, openSUSE, and macOS."""
    sys_name = platform.system()
    mgr = detect_package_manager()

    if sys_name == "Darwin":
        if mgr == "brew":
            return run_system_install(["brew", "install", "vapoursynth"])
        return False

    if sys_name == "Linux":
        if mgr == "apt-get":
            run_system_install(["apt-get", "update"])
            return run_system_install(["apt-get", "install", "-y", "vapoursynth", "python3-vapoursynth"])
        elif mgr in ["dnf", "yum"]:
            return run_system_install([mgr, "install", "-y", "vapoursynth", "python3-vapoursynth"])
        elif mgr == "pacman":
            return run_system_install(["pacman", "-S", "--noconfirm", "vapoursynth"])
        elif mgr == "zypper":
            return run_system_install(["zypper", "--non-interactive", "install", "vapoursynth"])

    return False
