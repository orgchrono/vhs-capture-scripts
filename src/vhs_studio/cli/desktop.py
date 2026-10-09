#!/usr/bin/env python3
"""
desktop.py - Lançador Desktop Nativo do VHS Studio via PyWebView (WebView2 no Windows)
Inicia o servidor de API local e abre uma janela de aplicativo dedicada com a interface React.
"""

import sys
import os
import hashlib
import threading
import subprocess
from vhs_studio.core.logger import log
from vhs_studio.core.constants import DEFAULT_API_HOST, DEFAULT_API_PORT
from vhs_studio.api.server import run_server


def get_base_path():
    """Documentation for get_base_path."""
    if hasattr(sys, "_MEIPASS"):
        return sys._MEIPASS
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def get_directory_hash(directory):
    """Documentation for get_directory_hash."""
    sha1 = hashlib.sha256()
    for root, dirs, files in os.walk(directory):
        for name in sorted(files):
            filepath = os.path.join(root, name)
            try:
                with open(filepath, "rb") as f:
                    while chunk := f.read(8192):
                        sha1.update(chunk)
            except Exception:
                pass
    return sha1.hexdigest()


def ensure_ui_build():
    """Documentation for ensure_ui_build."""
    if hasattr(sys, "_MEIPASS"):
        log.info(
            "[DESKTOP] Executável empacotado detectado. Pulando checagem de build do Vite."
        )
        return get_base_path()

    project_root = get_base_path()
    ui_src_dir = os.path.join(project_root, "ui", "src")
    ui_dist_dir = os.path.join(project_root, "ui", "dist")
    hash_file = os.path.join(ui_dist_dir, ".build_hash")

    if not os.path.exists(ui_src_dir):
        return project_root

    current_hash = get_directory_hash(ui_src_dir)
    # Include package.json in hash
    pkg_json = os.path.join(project_root, "ui", "package.json")
    if os.path.exists(pkg_json):
        with open(pkg_json, "rb") as f:
            current_hash += hashlib.sha256(f.read()).hexdigest()

    rebuild_needed = True
    if os.path.exists(hash_file) and os.path.exists(
        os.path.join(ui_dist_dir, "index.html")
    ):
        with open(hash_file, "r", encoding="utf-8") as f:
            if f.read().strip() == current_hash:
                rebuild_needed = False

    if rebuild_needed:
        index_exists = os.path.exists(os.path.join(ui_dist_dir, "index.html"))
        is_interactive = sys.stdin is not None and sys.stdin.isatty() and not os.environ.get("CI")

        if is_interactive and not index_exists:
            log.warning(
                "[SEGURANÇA] Mudanças detectadas nos arquivos da Interface (UI) ou Hash Mismatch."
            )
            print("")
            print("=== AVISO DE SEGURANÇA / INTEGRIDADE ===")
            print(
                "Deseja autorizar a compilação do novo código e instalar pacotes Node.js localmente?"
            )
            try:
                ans = input("Autorizar build da UI? (Y/n): ").strip().lower()
                authorized = ans in ("", "y", "yes")
            except (EOFError, OSError):
                authorized = True
        else:
            authorized = True

        if authorized:
            log.info("[DESKTOP] Compilando interface gráfica via Vite...")
            ui_dir = os.path.join(project_root, "ui")
            try:
                npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
                subprocess.run(f"{npm_cmd} run build", cwd=ui_dir, shell=True, check=True)
                os.makedirs(ui_dist_dir, exist_ok=True)
                with open(hash_file, "w", encoding="utf-8") as f:
                    f.write(current_hash)
                log.info(
                    "[DESKTOP] Build da UI concluída com sucesso e Cache atualizado!"
                )
            except Exception as e:
                log.error(f"[DESKTOP ERRO] Falha ao compilar a UI: {e}")
                if index_exists:
                    log.warning("[DESKTOP] Reutilizando versão compilada pré-existente.")
        else:
            log.warning(
                "[DESKTOP] Build rejeitada pelo usuário. Usando cache anterior."
            )
    else:
        log.info("[DESKTOP] UI Verificada (Security Hash Match).")

    return project_root


def run_desktop():
    """Documentation for run_desktop."""
    try:
        import webview
    except ImportError:
        log.error(
            "[DESKTOP] pywebview não encontrado. Por favor, execute: pip install pywebview fastapi uvicorn"
        )
        sys.exit(1)

    ensure_ui_build()

    port = DEFAULT_API_PORT
    t = threading.Thread(target=run_server, args=(port,), daemon=True)
    t.start()

    log.info(
        f"[DESKTOP] Iniciando janela nativa Desktop Pro em http://{DEFAULT_API_HOST}:{port}"
    )
    webview.create_window(
        title="VHS Studio",
        url=f"http://{DEFAULT_API_HOST}:{port}",
        width=1440,
        height=900,
        maximized=True,
        min_size=(1024, 700),
        background_color="#080c14",
    )
    webview.start(debug=False)


if __name__ == "main":
    run_desktop()
