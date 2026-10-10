import os
import sys
import subprocess
import shutil
import concurrent.futures
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class LintStep:
    name: str
    command: List[str]
    cwd: Optional[str] = None
    allow_failure: bool = False


def run_step(step: LintStep):
    try:
        cmd = step.command.copy()
        resolved_exe = shutil.which(cmd[0])
        if resolved_exe:
            cmd[0] = resolved_exe

        use_shell = os.name == 'nt' and cmd[0].lower().endswith('.cmd')

        result = subprocess.run(
            cmd,
            cwd=step.cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            errors="replace",
            shell=use_shell
        )
        return step, result.returncode == 0, result.stdout
    except Exception as e:
        return step, False, str(e)


def main():
    print("[Git Hook] Iniciando validação automática de código (Lint & Types)...\n")

    steps = [
        LintStep("Anti-Plágio/Duplicação (JSCPD)", ["npx", "jscpd", "src", "ui/src", "--threshold", "5"]),
        LintStep("UI Linter (Oxlint / ESLint)", ["npm", "run", "lint"], cwd="ui"),
        LintStep("Mypy (Python Types)", ["python", "-m", "mypy", "src", "--ignore-missing-imports"]),
        LintStep(
            "Flake8 (Python Style)",
            ["python", "-m", "flake8", "src", "scripts", "tests", "--max-line-length=120", "--ignore=E501,F401,E402,W293,E226"]
        ),
        LintStep("Vitest (React Unit Tests)", ["npm", "run", "test:unit"], cwd="ui"),
        LintStep("TSC (TypeScript Types)", ["npm", "run", "build"], cwd="ui"),
        LintStep("Playwright (E2E React)", ["npx", "playwright", "test", "--project=chromium", "--reporter=list"], cwd="ui"),
        LintStep("Pytest (Python Tests)", ["python", "-m", "pytest", "tests"]),
    ]

    print("[*] Rodando Linter e Type Checking (Paralelizado)...")
    
    all_passed = True
    failed_steps = []
    
    report_lines = [
        "# VHS Studio Pro - Build & Quality Report",
        f"**Date:** {datetime.now(timezone.utc).isoformat()}\n",
        "## Summary\n"
    ]

    with concurrent.futures.ThreadPoolExecutor(max_workers=os.cpu_count()) as executor:
        futures = {executor.submit(run_step, step): step for step in steps}
        
        for future in concurrent.futures.as_completed(futures):
            step, passed, output = future.result()
            
            if passed:
                print(f"[{step.name}] PASSOU")
                report_lines.append(f"- **{step.name}**: :white_check_mark: PASSED")
            else:
                print(f"[{step.name}] FALHOU")
                report_lines.append(f"- **{step.name}**: :x: FAILED")
                failed_steps.append((step, output))
                if not step.allow_failure:
                    all_passed = False

    report_lines.append("\n## Details\n")
    if failed_steps:
        for step, output in failed_steps:
            report_lines.append(f"### {step.name}")
            report_lines.append("`	ext\n" + output + "\n`\n")
    else:
        report_lines.append("All quality checks passed perfectly. Zero regressions detected.\n")

    os.makedirs("logs", exist_ok=True)
    with open("logs/build_report.md", "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))

    if not all_passed:
        print("\n=== REPROVADO. CORRIJA OS ERROS ANTES DE CONTINUAR. ===")
        print(f"Veja o relatório detalhado em: {os.path.abspath('logs/build_report.md')}")
        sys.exit(1)
    else:
        print("\n=== TODOS OS TESTES PASSARAM. O CODIGO ESTA LIMPO! ===")
        print(f"Relatório de build gerado em: {os.path.abspath('logs/build_report.md')}")
        sys.exit(0)


if __name__ == "__main__":
    main()
