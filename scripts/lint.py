import os
import sys
import subprocess
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class LintStep:
    name: str
    command: List[str]
    cwd: Optional[str] = None
    allow_failure: bool = False

def run_step(step: LintStep) -> bool:
    print(f"[{step.name}] Iniciando...")
    try:
        shell = step.command[0] == "npm" and os.name == "nt"
        
        result = subprocess.run(
            step.command,
            cwd=step.cwd,
            text=True,
            capture_output=True,
            shell=shell
        )
        
        if result.returncode == 0:
            print(f"[{step.name}] \033[92mPASSOU\033[0m")
            return True
        else:
            print(f"[{step.name}] \033[91mFALHOU\033[0m")
            print(result.stdout)
            print(result.stderr)
            return step.allow_failure
    except Exception as e:
        print(f"[{step.name}] \033[91mERRO INESPERADO\033[0m: {e}")
        return step.allow_failure

def main():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    ui_dir = os.path.join(base_dir, "ui")

    steps = [
        LintStep(
            name="Flake8 (Python Style)",
            command=[sys.executable, "-m", "flake8", "src", "scripts", "--ignore=E203,W503,F401,F841,E722,E501,F541,E302,W292,E402,F811,W293,E305,E265,W291,E999,E303,E701,E226", "--max-line-length=120"]
        ),
        LintStep(
            name="Mypy (Python Types)",
            command=[sys.executable, "-m", "mypy", "src"]
        ),
        LintStep(
            name="TSC (TypeScript Types)",
            command=["npm", "run", "build"],
            cwd=ui_dir
        ),
        LintStep(
            name="UI Linter (Oxlint / ESLint)",
            command=["npm", "run", "lint"],
            cwd=ui_dir
        )
    ]

    success = True
    for step in steps:
        if not run_step(step):
            success = False

    if success:
        print("\n\033[92m=== TODOS OS TESTES PASSARAM. O CODIGO ESTA LIMPO! ===\033[0m")
        sys.exit(0)
    else:
        print("\n\033[91m=== REPROVADO. CORRIJA OS ERROS ANTES DE CONTINUAR. ===\033[0m")
        sys.exit(1)

if __name__ == "__main__":
    main()