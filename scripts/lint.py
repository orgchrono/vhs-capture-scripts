#!/usr/bin/env python3
"""
Cross-platform linting and type checking script for VHS Studio Pro.
Replaces OS-specific scripts (like .ps1 or .sh) to ensure 100% 
compatibility across Windows, macOS, and Linux.
"""

import subprocess
import sys
import os

def run_step(name: str, cmd: list, cwd: str = None) -> bool:
    print(f"\n=======================================================")
    print(f"[*] Executando: {name}")
    print(f"=======================================================")
    try:
        # shell=True is needed on Windows for npx/npm if not using absolute paths, 
        # but cross-platform we can just use shell=True for node commands safely here
        is_shell = os.name == 'nt' and cmd[0] in ['npm', 'npx']
        
        result = subprocess.run(cmd, cwd=cwd, shell=is_shell)
        if result.returncode != 0:
            print(f"\n[X] FALHA: {name} retornou código {result.returncode}")
            return False
        
        print(f"[V] SUCESSO: {name}")
        return True
    except FileNotFoundError:
        print(f"\n[X] FALHA: Comando não encontrado -> {cmd[0]}")
        return False
    except Exception as e:
        print(f"\n[X] FALHA INESPERADA: {e}")
        return False

def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    ui_dir = os.path.join(repo_root, "ui")
    
    steps = [
        {
            "name": "Python Linter (Flake8)",
            "cmd": [sys.executable, "-m", "flake8", "src/vhs_studio", "--count", "--select=E9,F63,F7,F82", "--show-source", "--statistics"],
            "cwd": repo_root
        },
        {
            "name": "Python Type Checker (MyPy)",
            "cmd": [sys.executable, "-m", "mypy", "src/vhs_studio", "--ignore-missing-imports"],
            "cwd": repo_root
        },
        {
            "name": "TypeScript Type Checker (tsc)",
            "cmd": ["npx", "tsc", "--noEmit"],
            "cwd": ui_dir
        }
    ]
    
    failed = False
    for step in steps:
        if not run_step(step["name"], step["cmd"], step["cwd"]):
            failed = True
            
    print("\n=======================================================")
    if failed:
        print("[!] STATUS FINAL: REPROVADO. Corrija os erros acima antes de fazer o commit.")
        sys.exit(1)
    else:
        print("[*] STATUS FINAL: APROVADO. Código limpo e tipado perfeitamente!")
        sys.exit(0)

if __name__ == "__main__":
    main()