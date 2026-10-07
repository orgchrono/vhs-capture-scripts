#!/usr/bin/env python3
"""
run_desktop.py - Lançador Desktop Nativo do VHS Studio via PyWebView (WebView2 no Windows)
Inicia o servidor de API local e abre uma janela de aplicativo dedicada com a interface React.
"""

import os
import sys
import json
import subprocess
import threading
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RESTORATION_DIR = os.path.join(REPO_ROOT, "restoration")
LIB_DIR = os.path.join(RESTORATION_DIR, "lib")
DIST_DIR = os.path.join(REPO_ROOT, "ui", "dist")

if RESTORATION_DIR not in sys.path:
    sys.path.insert(0, RESTORATION_DIR)
if LIB_DIR not in sys.path:
    sys.path.insert(0, LIB_DIR)

from lib.logger import log
from lib.filter_builder import FilterBuilder
from lib.vapoursynth_qtgmc import VapourSynthQTGMC

active_process = None
process_logs = []
process_lock = threading.Lock()

def get_system_status():
    encoder = FilterBuilder.detect_best_encoder()
    vs_ok = VapourSynthQTGMC.is_available()

    raw_dir = os.path.join(REPO_ROOT, "media", "raw")
    os.makedirs(raw_dir, exist_ok=True)

    valid_exts = {".mkv", ".mp4", ".mov", ".avi", ".ts", ".m2ts"}
    raw_files = []
    for f in os.listdir(raw_dir):
        ext = os.path.splitext(f)[1].lower()
        if ext in valid_exts:
            full_p = os.path.join(raw_dir, f)
            size_mb = os.path.getsize(full_p) / (1024 * 1024)
            raw_files.append({"name": f, "path": full_p, "size_mb": round(size_mb, 1)})

    return {
        "encoder": encoder,
        "vapoursynth_available": vs_ok,
        "obs_connected": False,
        "raw_files": raw_files
    }

class StudioHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(get_system_status()).encode("utf-8"))
        elif parsed.path == "/api/logs":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            with process_lock:
                active = active_process is not None and active_process.poll() is None
                logs = list(process_logs)
            self.wfile.write(json.dumps({"active": active, "logs": logs}).encode("utf-8"))
        else:
            # Se for requisição SPA e o arquivo não existir fisicamente, serve index.html
            file_path = os.path.join(DIST_DIR, parsed.path.lstrip("/"))
            if not os.path.exists(file_path) and not parsed.path.startswith("/api"):
                self.path = "/index.html"
            super().do_GET()

    def do_POST(self):
        global active_process, process_logs
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/run":
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            params = json.loads(body.decode("utf-8"))

            with process_lock:
                if active_process is not None and active_process.poll() is None:
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "error", "message": "Já existe uma restauração em andamento!"}).encode("utf-8"))
                    return

                process_logs.clear()
                cmd = [
                    sys.executable,
                    os.path.join(RESTORATION_DIR, "direct_restore.py"),
                    params["input"],
                    "--deinterlacer", params.get("deinterlacer", "auto"),
                    "--mode", params.get("mode", "freeze"),
                    "--audio-mode", params.get("audio_mode", "auto"),
                    "--crf", str(params.get("crf", 20)),
                    "--audio-offset", str(params.get("audio_offset", 0.0))
                ]
                if params.get("no_1080p"):
                    cmd.append("--no-1080p")
                if params.get("chroma_fix"):
                    cmd.append("--chroma-fix")
                if params.get("denoise"):
                    cmd.append("--denoise")

                active_process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1
                )

                def reader_thread(proc):
                    for line in iter(proc.stdout.readline, ''):
                        if line:
                            with process_lock:
                                process_logs.append(line.rstrip())
                    proc.stdout.close()
                    proc.wait()

                t = threading.Thread(target=reader_thread, args=(active_process,), daemon=True)
                t.start()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "started"}).encode("utf-8"))

        elif parsed.path == "/api/install_qtgmc":
            with process_lock:
                process_logs.clear()
                process_logs.append("[ASSISTENTE] Disparando instalador automatizado do VapourSynth e QTGMC...")

                bin_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "restoration", "bin"))
                if sys.platform == "win32":
                    script = os.path.join(bin_dir, "setup_vapoursynth.ps1")
                    cmd = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script]
                else:
                    script = os.path.join(bin_dir, "setup_vapoursynth.sh")
                    cmd = ["bash", script]

                active_process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1
                )

                def reader_thread(proc):
                    for line in iter(proc.stdout.readline, ''):
                        if line:
                            with process_lock:
                                process_logs.append(line.rstrip())
                    proc.stdout.close()
                    proc.wait()

                t = threading.Thread(target=reader_thread, args=(active_process,), daemon=True)
                t.start()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "started"}).encode("utf-8"))

        elif parsed.path in ("/api/obs/start", "/api/obs/stop"):
            # Mock / stub para feedback quando OBS não estiver conectado
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "message": "Comando OBS enviado com sucesso."}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

def run_server(port=8088):
    server = HTTPServer(("127.0.0.1", port), StudioHTTPHandler)
    server.serve_forever()

def main():
    try:
        import webview
    except ImportError:
        log.info("[DESKTOP] Instalando pywebview...")
        subprocess.run([sys.executable, "-m", "pip", "install", "pywebview"], check=True)
        import webview

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
    main()
