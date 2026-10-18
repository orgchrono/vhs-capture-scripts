"""Module documentation pending."""

import sys
import subprocess
from vhs_studio.core.system_process import run_silent
import os
import urllib.request
import tempfile
import time
from vhs_studio.core.paths import get_python_interpreter
from vhs_studio.video.vapoursynth_qtgmc import VapourSynthQTGMC
from vhs_studio.cli.utils import print_step, print_success, print_error


def run_cmd(cmd, shell=False):
    """Run command with safe cross-platform encoding error handling."""
    result = run_silent(
        cmd,
        shell=shell,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )  # nosec
    return result


def setup_vapoursynth_windows():
    """Automated VapourSynth and QTGMC setup for Windows."""
    print_step("Starting automated VapourSynth + QTGMC setup for Windows...")

    # 1. Check vspipe
    print_step("Checking vspipe installation...")
    existing_vspipe = VapourSynthQTGMC.get_vspipe_path()
    if existing_vspipe:
        print_success(
            f"VapourSynth is already installed: {existing_vspipe}"
        )
    else:
        print_step("vspipe not found. Attempting installation via WinGet...")
        winget_res = run_cmd(
            [
                "winget",
                "install",
                "VapourSynth.VapourSynth",
                "--accept-source-agreements",
                "--accept-package-agreements",
                "--silent",
            ]
        )
        if winget_res.returncode == 0:
            print_success("VapourSynth installed successfully via WinGet!")
        else:
            installer_url = (
                "https://github.com/vapoursynth/vapoursynth/releases/latest/download/VapourSynth65-Setup.exe"
            )
            installer_path = os.path.join(
                tempfile.gettempdir(), "VapourSynth-Setup.exe"
            )
            try:
                urllib.request.urlretrieve(installer_url, installer_path)  # nosec
                print_step(
                    "Running installer (Administrator permissions may be required)..."
                )
                run_silent([installer_path, "/S"])
                print_success("Official installer executed.")
            except Exception as e:
                print_error(f"Download/install failed: {e}")
                return False

    # 2. Install python deps
    print_step("Installing Python libraries for QTGMC (havsfunc)...")
    py_bin = get_python_interpreter()
    pip_res = run_cmd(
        [py_bin, "-m", "pip", "install", "vapoursynth", "havsfunc"]
    )
    if pip_res.returncode == 0:
        print_success("Libraries installed successfully!")
    else:
        print_error(f"Warning: pip error: {pip_res.stderr}")

    # 3. Test
    print_step("Validating installation...")
    time.sleep(2)  # Wait for paths to settle
    test_res = run_cmd(
        [
            py_bin,
            "-c",
            "import vapoursynth as vs; print('VapourSynth API:', vs.core.version())",
        ]
    )
    if test_res.returncode == 0:
        print_success(test_res.stdout.strip())
        print_success("QTGMC and VapourSynth are 100% ready for VHS Studio!")
    else:
        print_error(
            "VapourSynth installed but failed to import in Python. Restart the terminal or application to refresh system PATH."
        )

    return True


def setup_vapoursynth_unix():
    """Install VapourSynth and havsfunc on Linux or macOS."""
    print_step("Starting automated VapourSynth + QTGMC setup for Linux/macOS...")
    from vhs_studio.core.package_manager import install_vapoursynth_crossplatform

    if install_vapoursynth_crossplatform():
        print_success("VapourSynth installed successfully via system package manager!")
    else:
        print_step("System package manager unavailable or VapourSynth already installed.")

    print_step("Installing Python libraries for QTGMC (havsfunc)...")
    py_bin = get_python_interpreter()
    pip_res = run_cmd([py_bin, "-m", "pip", "install", "vapoursynth", "havsfunc"])
    if pip_res.returncode == 0:
        print_success("Python libraries installed successfully!")
    else:
        print_error(f"Pip error: {pip_res.stderr}")

    test_res = run_cmd(
        [
            py_bin,
            "-c",
            "import vapoursynth as vs; print('VapourSynth API:', vs.core.version())",
        ]
    )
    if test_res.returncode == 0:
        print_success(test_res.stdout.strip())
        print_success("QTGMC and VapourSynth are 100% ready for VHS Studio!")
        return True
    else:
        print_error(
            "VapourSynth installed but failed to import in Python. Please check the virtual environment."
        )
        return False


def main() -> int:
    """CLI / programmatic entrypoint for QTGMC setup."""
    if sys.platform == "win32":
        ok = setup_vapoursynth_windows()
    else:
        ok = setup_vapoursynth_unix()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
