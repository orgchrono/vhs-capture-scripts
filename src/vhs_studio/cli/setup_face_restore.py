"""Automated setup script for CodeFormer / GFPGAN face restoration toolchain."""

import os
import sys
import subprocess
from vhs_studio.core.system_process import run_silent
from vhs_studio.cli.utils import print_step, print_success, print_error
from vhs_studio.ai.face_restorer import FaceRestorer
from vhs_studio.core.paths import CODEFORMER_DIR, TOOLS_DIR, get_python_interpreter


def setup_face_restorer() -> bool:
    """Check, auto-install, or prepare neural face restoration engine."""
    print_step("Iniciando setup automático do motor neural de restauração facial...")

    restorer = FaceRestorer()
    if restorer.is_available():
        print_success("Motor de restauração facial (CodeFormer/GFPGAN) já está pronto e disponível.")
        return True

    print_step("Dependências neurais não detectadas. Iniciando auto-instalação via pip...")
    os.makedirs(TOOLS_DIR, exist_ok=True)
    os.makedirs(CODEFORMER_DIR, exist_ok=True)

    try:
        py_exe = get_python_interpreter()
        cmd = [py_exe, "-m", "pip", "install", "facexlib", "torchvision", "--quiet"]
        res = run_silent(
            cmd,
            capture_output=True,
            text=True,
            errors="replace",
            timeout=180,
        )
        if res.returncode == 0:
            print_success("Pacotes facexlib e torchvision instalados com sucesso!")
            return True
        else:
            print_error(f"Auto-instalação via pip retornou código de erro: {res.stderr.strip()[:200]}")
    except Exception as exc:
        print_error(f"Falha ao executar auto-instalação de pacotes: {exc}")

    # Fallback status
    print_step("Fallback inteligente: o sistema utilizará nitidez facial adaptativa FFmpeg CAS sem interrupção.")
    return False


def main():
    """CLI entrypoint."""
    success = setup_face_restorer()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
