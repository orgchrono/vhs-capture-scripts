#!/usr/bin/env python3
"""
fast_deps.py - High-Performance Dependency Manager & Smart Cache
Eliminates redundant network checks and package resolution delays.
Uses cryptographic hashing, 'uv' acceleration, and parallel worker threads.
"""

import os
import sys
import shutil
import hashlib
import subprocess
import concurrent.futures
from typing import Tuple

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PYPROJECT_PATH = os.path.join(PROJECT_ROOT, "pyproject.toml")
UI_DIR = os.path.join(PROJECT_ROOT, "ui")
UI_PACKAGE_JSON = os.path.join(UI_DIR, "package.json")
UI_PACKAGE_LOCK = os.path.join(UI_DIR, "package-lock.json")

VENV_DIR = os.path.join(PROJECT_ROOT, ".venv")
PYTHON_HASH_FILE = os.path.join(VENV_DIR, ".deps_hash")
UI_HASH_FILE = os.path.join(UI_DIR, "node_modules", ".deps_hash")


def compute_file_hash(path: str) -> str:
    """Compute SHA-256 hash of a file."""
    if not os.path.exists(path):
        return ""
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def check_python_deps() -> Tuple[bool, str]:
    """Check if Python dependencies are already satisfied based on pyproject.toml hash."""
    current_hash = compute_file_hash(PYPROJECT_PATH)
    if not current_hash:
        return False, ""

    if os.path.exists(PYTHON_HASH_FILE):
        try:
            with open(PYTHON_HASH_FILE, "r", encoding="utf-8") as f:
                saved_hash = f.read().strip()
                if saved_hash == current_hash:
                    return True, current_hash
        except Exception:
            pass
    return False, current_hash


def check_ui_deps() -> Tuple[bool, str]:
    """Check if UI dependencies are already satisfied based on package.json & lockfile."""
    pkg_hash = compute_file_hash(UI_PACKAGE_JSON)
    lock_hash = compute_file_hash(UI_PACKAGE_LOCK)
    combined = hashlib.sha256((pkg_hash + lock_hash).encode("utf-8")).hexdigest()

    if os.path.exists(os.path.join(UI_DIR, "node_modules")) and os.path.exists(UI_HASH_FILE):
        try:
            with open(UI_HASH_FILE, "r", encoding="utf-8") as f:
                saved_hash = f.read().strip()
                if saved_hash == combined:
                    return True, combined
        except Exception:
            pass
    return False, combined


def install_python_deps(target_hash: str) -> bool:
    """Install Python dependencies using uv (if available or installable) or standard pip."""
    print("[*] Sincronizando dependências Python...", flush=True)

    use_uv = False
    uv_path = shutil.which("uv")
    if not uv_path:
        # Tenta bootstrap do uv para ganho de performance de até 100x
        try:
            res = subprocess.run(
                [sys.executable, "-m", "pip", "install", "uv"],
                capture_output=True,
                check=False
            )
            if res.returncode == 0 and shutil.which("uv"):
                use_uv = True
                uv_path = shutil.which("uv")
        except Exception:
            pass
    else:
        use_uv = True

    try:
        if use_uv and uv_path:
            cmd = [uv_path, "pip", "install", "-e", ".[dev,ai,cloud]"]
        else:
            cmd = [sys.executable, "-m", "pip", "install", "-e", ".[dev,ai,cloud]"]

        res = subprocess.run(cmd, cwd=PROJECT_ROOT, check=True)
        if res.returncode == 0:
            os.makedirs(os.path.dirname(PYTHON_HASH_FILE), exist_ok=True)
            with open(PYTHON_HASH_FILE, "w", encoding="utf-8") as f:
                f.write(target_hash)
            print("[+] Dependências Python sincronizadas com sucesso!", flush=True)
            return True
    except Exception as e:
        print(f"[!] Falha ao instalar dependências Python: {e}", file=sys.stderr, flush=True)
    return False


def install_ui_deps(target_hash: str) -> bool:
    """Install UI dependencies using npm."""
    print("[*] Sincronizando dependências da UI (npm)...", flush=True)
    npm_exe = shutil.which("npm")
    if not npm_exe:
        print("[!] npm não encontrado no PATH.", file=sys.stderr, flush=True)
        return False

    use_shell = os.name == 'nt' and npm_exe.lower().endswith('.cmd')
    try:
        cmd = [npm_exe, "install"]
        res = subprocess.run(cmd, cwd=UI_DIR, check=True, shell=use_shell)
        if res.returncode == 0:
            os.makedirs(os.path.dirname(UI_HASH_FILE), exist_ok=True)
            with open(UI_HASH_FILE, "w", encoding="utf-8") as f:
                f.write(target_hash)
            print("[+] Dependências da UI sincronizadas com sucesso!", flush=True)
            return True
    except Exception as e:
        print(f"[!] Falha ao instalar dependências da UI: {e}", file=sys.stderr, flush=True)
    return False


def main():
    """Main fast dependency coordinator."""
    py_ok, py_hash = check_python_deps()
    ui_ok, ui_hash = check_ui_deps()

    if py_ok and ui_ok:
        print("[FastDeps] Dependências Python e UI já sincronizadas e atualizadas (0.01s).", flush=True)
        return 0

    tasks = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        if not py_ok:
            tasks.append(executor.submit(install_python_deps, py_hash))
        if not ui_ok:
            tasks.append(executor.submit(install_ui_deps, ui_hash))

        results = [t.result() for t in tasks]

    if all(results):
        print("[FastDeps] Todas as dependências sincronizadas com sucesso!", flush=True)
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
