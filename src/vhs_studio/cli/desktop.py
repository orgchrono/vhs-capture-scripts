#!/usr/bin/env python3
"""
desktop.py - Lançador Desktop Nativo do VHS Studio via PyWebView (WebView2 no Windows)
Inicia o servidor de API local e abre uma janela de aplicativo dedicada com a interface React.
"""

import sys
import threading
from vhs_studio.core.logger import log
from vhs_studio.api.server import run_server

def run_desktop():
    try:
        import webview
    except ImportError:
        log.error("[DESKTOP] pywebview não encontrado. Por favor, execute: pip install pywebview fastapi uvicorn")
        sys.exit(1)

    port = 8088
    t = threading.Thread(target=run_server, args=(port,), daemon=True)
    t.start()

    log.info(f"[DESKTOP] Iniciando janela nativa Desktop Pro em http://127.0.0.1:{port}")
    window = webview.create_window(
        title="VHS Studio - Padrão Ouro Desktop",
        url=f"http://127.0.0.1:{port}",
        width=1280,
        height=860,
        min_size=(1024, 700),
        background_color="#080c14"
    )
    webview.start(debug=False)

if __name__ == "__main__":
    run_desktop()
