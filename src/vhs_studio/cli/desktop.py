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
from vhs_studio.api.server import run_server


def get_base_path():
    if hasattr(sys, "_MEIPASS"):
        return sys._MEIPASS
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def get_directory_hash(directory):
    sha1 = hashlib.sha1()
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
    if hasattr(sys, "_MEIPASS"):
        log.info("[DESKTOP] Executável empacotado detectado. Pulando checagem de build do Vite.")
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
            current_hash += hashlib.sha1(f.read()).hexdigest()

    rebuild_needed = True
    if os.path.exists(hash_file) and os.path.exists(os.path.join(ui_dist_dir, "index.html")):
        with open(hash_file, "r") as f:
            if f.read().strip() == current_hash:
                rebuild_needed = False

    if rebuild_needed:
        log.warning("[SEGURANÇA] Mudanças detectadas nos arquivos da Interface (UI) ou Hash Mismatch.")
        log.warning("O sistema identificou código novo em 'ui/src'. O build requer execução de 'npm install'.")
        print("")
        print("=== AVISO DE SEGURANÇA / INTEGRIDADE ===")
        print("Deseja autorizar a compilação do novo código e instalar pacotes Node.js localmente?")
        ans = input("Autorizar build da UI? (Y/n): ").strip().lower()
        if ans == "" or ans == "y" or ans == "yes":
            log.info("[DESKTOP] Autorização concedida. Compilando via Vite...")
            ui_dir = os.path.join(project_root, "ui")
            try:
                subprocess.run("npm install", cwd=ui_dir, shell=True, check=True)
                subprocess.run("npm run build", cwd=ui_dir, shell=True, check=True)
                os.makedirs(ui_dist_dir, exist_ok=True)
                with open(hash_file, "w") as f:
                    f.write(current_hash)
                log.info("[DESKTOP] Build da UI concluída com sucesso e Cache atualizado!")
            except Exception as e:
                log.error(f"[DESKTOP ERRO] Falha ao compilar a UI: {e}")
        else:
            log.warning("[DESKTOP] Build rejeitada pelo usuário por razões de segurança. Usando cache anterior.")
    else:
        log.info("[DESKTOP] UI Verificada (Security Hash Match).")

    return project_root


def run_desktop():
    try:
        import webview
    except ImportError:
        log.error("[DESKTOP] pywebview não encontrado. Por favor, execute: pip install pywebview fastapi uvicorn")
        sys.exit(1)

    ensure_ui_build()

    port = 8088
    t = threading.Thread(target=run_server, args=(port,), daemon=True)
    t.start()

    log.info(f"[DESKTOP] Iniciando janela nativa Desktop Pro em http://127.0.0.1:{port}")
    webview.create_window(
        title="VHS Studio",
        url=f"http://127.0.0.1:{port}",
        width=1440,
        height=900,
        maximized=True,
        min_size=(1024, 700),
        background_color="#080c14",
    )
    webview.start(debug=False)


if __name__ == "main":
    run_desktop()
