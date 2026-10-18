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
    """Documentation for setup_vapoursynth_windows."""
    print_step("Iniciando setup automático do VapourSynth + QTGMC para Windows...")

    # 1. Check vspipe
    print_step("Verificando instalação do vspipe...")
    existing_vspipe = VapourSynthQTGMC.get_vspipe_path()
    if existing_vspipe:
        print_success(
            f"VapourSynth já está instalado: {existing_vspipe}"
        )
    else:
        print_step("vspipe não encontrado. Tentando instalar via WinGet...")
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
            print_success("VapourSynth instalado com sucesso via WinGet!")
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
                    "Executando instalador (isso pode exigir permissão de Administrador)..."
                )
                run_silent([installer_path, "/S"])
                print_success("Instalador oficial executado.")
            except Exception as e:
                print_error(f"Falha ao baixar/instalar: {e}")
                return False

    # 2. Install python deps
    print_step("Instalando bibliotecas Python para QTGMC (havsfunc)...")
    py_bin = get_python_interpreter()
    pip_res = run_cmd(
        [py_bin, "-m", "pip", "install", "vapoursynth", "havsfunc"]
    )
    if pip_res.returncode == 0:
        print_success("Bibliotecas instaladas com sucesso!")
    else:
        print_error(f"Aviso: Erro no pip: {pip_res.stderr}")

    # 3. Test
    print_step("Validando instalação...")
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
        print_success("QTGMC e VapourSynth estão 100% prontos para uso no VHS Studio!")
    else:
        print_error(
            "VapourSynth instalado, mas não carregou no Python. Reinicie o terminal/aplicativo para atualizar o PATH do sistema."  # noqa: E501
        )

    return True


def setup_vapoursynth_unix():
    """Install VapourSynth and havsfunc on Linux or macOS."""
    print_step("Iniciando setup automático do VapourSynth + QTGMC para Linux/macOS...")
    from vhs_studio.core.package_manager import install_vapoursynth_crossplatform

    if install_vapoursynth_crossplatform():
        print_success("VapourSynth instalado com sucesso pelo gerenciador de pacotes do sistema!")
    else:
        print_step("Gerenciador de pacotes automático indisponível ou VapourSynth já existente.")

    print_step("Instalando bibliotecas Python para QTGMC (havsfunc)...")
    py_bin = get_python_interpreter()
    pip_res = run_cmd([py_bin, "-m", "pip", "install", "vapoursynth", "havsfunc"])
    if pip_res.returncode == 0:
        print_success("Bibliotecas Python havsfunc instaladas!")
    else:
        print_error(f"Aviso no pip: {pip_res.stderr}")

    test_res = run_cmd(
        [
            py_bin,
            "-c",
            "import vapoursynth as vs; print('VapourSynth API:', vs.core.version())",
        ]
    )
    if test_res.returncode == 0:
        print_success(test_res.stdout.strip())
        print_success("QTGMC e VapourSynth estão 100% prontos para uso no VHS Studio!")
        return True
    else:
        print_error(
            "VapourSynth instalado, mas não carregou no Python. Verifique o ambiente virtual."
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
